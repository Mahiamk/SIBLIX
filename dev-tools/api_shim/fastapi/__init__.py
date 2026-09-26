"""
Minimal FastAPI-compatible shim.

This exists ONLY because this sandbox has no network access to `pip install
fastapi`, so the real FastAPI/Starlette/Pydantic stack can never actually be
installed here. This shim implements just the subset of the FastAPI API
surface that backend/app/*.py actually uses (checked by grep — see the
accompanying test report), so the REAL, UNMODIFIED application code
(app/main.py, app/api/*.py) can be imported and actually executed end to
end against real HTTP-shaped requests, real path/query/body parsing, real
dependency injection, and a real (SQLite-backed) database — instead of
either skipping this layer entirely or hand-waving it.

It is intentionally not a general-purpose FastAPI reimplementation. It does
not need to be — it just needs to run this one app correctly.
"""
import inspect
import json
import re
import typing
from urllib.parse import urlsplit, parse_qs


class HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"{status_code}: {detail}")


class Depends:
    def __init__(self, dependency):
        self.dependency = dependency


class _HeaderMarker:
    def __init__(self, default=None):
        self.default = default


def Header(default=None, **kwargs):
    return _HeaderMarker(default)


class BackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args, **kwargs):
        self.tasks.append((fn, args, kwargs))

    def run_all(self):
        for fn, args, kwargs in self.tasks:
            fn(*args, **kwargs)


def _unwrap_optional(annotation):
    if typing.get_origin(annotation) is typing.Union:
        args = [a for a in typing.get_args(annotation) if a is not type(None)]
        if len(args) == 1:
            return args[0]
    return annotation


def _is_basemodel(annotation):
    try:
        from pydantic import BaseModel
        return isinstance(annotation, type) and issubclass(annotation, BaseModel)
    except Exception:
        return False


def _coerce(value, annotation):
    annotation = _unwrap_optional(annotation)
    if annotation is int:
        return int(value)
    if annotation is float:
        return float(value)
    if annotation is bool:
        return str(value).lower() in ("1", "true", "yes")
    return value


class _Route:
    def __init__(self, method, path, func, dependencies):
        self.method = method
        self.path = path
        self.func = func
        self.dependencies = dependencies or []
        param_names = re.findall(r"{(\w+)}", path)
        pattern = re.sub(r"{(\w+)}", r"(?P<\1>[^/]+)", path)
        self.regex = re.compile("^" + pattern + "$")
        self.param_names = param_names

    def match(self, method, path):
        if method != self.method:
            return None
        m = self.regex.match(path)
        if not m:
            return None
        return m.groupdict()


class APIRouter:
    def __init__(self, prefix="", tags=None, dependencies=None):
        self.prefix = prefix
        self.tags = tags
        self.dependencies = dependencies or []
        self.routes = []

    def _add(self, method, path):
        def deco(func):
            self.routes.append(_Route(method, self.prefix + path, func, list(self.dependencies)))
            return func
        return deco

    def get(self, path, **kwargs):
        return self._add("GET", path)

    def post(self, path, **kwargs):
        return self._add("POST", path)


class _FakeMiddlewareStack:
    def __init__(self):
        self.entries = []

    def add(self, cls, **kwargs):
        self.entries.append((cls, kwargs))


class FastAPI:
    def __init__(self, title=None, description=None, version=None):
        self.title = title
        self.routes = []
        self.startup_handlers = []
        self.middleware_stack = _FakeMiddlewareStack()

    def add_middleware(self, cls, **kwargs):
        self.middleware_stack.add(cls, **kwargs)

    def on_event(self, name):
        def deco(func):
            if name == "startup":
                self.startup_handlers.append(func)
            return func
        return deco

    def get(self, path, **kwargs):
        def deco(func):
            self.routes.append(_Route("GET", path, func, []))
            return func
        return deco

    def post(self, path, **kwargs):
        def deco(func):
            self.routes.append(_Route("POST", path, func, []))
            return func
        return deco

    def include_router(self, router):
        self.routes.extend(router.routes)

    def run_startup(self):
        for fn in self.startup_handlers:
            fn()


def _jsonable(obj):
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if hasattr(obj, "dict") and callable(getattr(obj, "dict")):
        try:
            return _jsonable(obj.dict())
        except TypeError:
            pass
    return obj


class _Response:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        # round-trip through real json (default=str) so datetimes etc. come
        # back exactly the way a real HTTP client would receive them
        return json.loads(json.dumps(_jsonable(self._payload), default=str))


class _Request:
    def __init__(self, method, path, query, headers, json_body):
        self.method = method
        self.path = path
        self.query = query
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self.json_body = json_body


class _Client:
    """Stands in for fastapi.testclient.TestClient's .get/.post interface."""

    def __init__(self, app: FastAPI):
        self.app = app
        self._started = False

    def _ensure_started(self):
        if not self._started:
            self.app.run_startup()
            self._started = True

    def get(self, url, headers=None):
        return self._call("GET", url, headers=headers)

    def post(self, url, json=None, headers=None):
        return self._call("POST", url, headers=headers, json_body=json)

    def _call(self, method, url, headers=None, json_body=None):
        self._ensure_started()
        split = urlsplit(url)
        path = split.path
        query = {k: v[0] for k, v in parse_qs(split.query).items()}

        for route in self.app.routes:
            path_params = route.match(method, path)
            if path_params is None:
                continue
            request = _Request(method, path, query, headers, json_body)
            try:
                background_tasks_holder = []
                kwargs = self._resolve_params(route.func, path_params, request, background_tasks_holder)
                for dep in route.dependencies:
                    self._resolve_callable(dep.dependency, path_params, request, background_tasks_holder)
                result = route.func(**kwargs)
                for bt in background_tasks_holder:
                    bt.run_all()
                return _Response(200, result)
            except HTTPException as exc:
                return _Response(exc.status_code, {"detail": exc.detail})
        return _Response(404, {"detail": f"No route for {method} {path}"})

    def _resolve_callable(self, fn, path_params, request, background_tasks_holder):
        sig = inspect.signature(fn)
        kwargs = {}
        for name, param in sig.parameters.items():
            kwargs[name] = self._resolve_one(name, param, path_params, request, background_tasks_holder)
        if inspect.isgeneratorfunction(fn):
            gen = fn(**kwargs)
            value = next(gen)
            # drain the generator later isn't necessary for our simple
            # get_session() usage (no post-yield cleanup logic in this app)
            return value
        return fn(**kwargs)

    def _resolve_params(self, fn, path_params, request, background_tasks_holder):
        sig = inspect.signature(fn)
        kwargs = {}
        for name, param in sig.parameters.items():
            kwargs[name] = self._resolve_one(name, param, path_params, request, background_tasks_holder)
        return kwargs

    def _resolve_one(self, name, param, path_params, request, background_tasks_holder):
        default = param.default
        annotation = param.annotation

        if isinstance(default, Depends):
            return self._resolve_callable(default.dependency, path_params, request, background_tasks_holder)

        if isinstance(default, _HeaderMarker):
            return request.headers.get(name.replace("_", "-"), default.default)

        if annotation is BackgroundTasks:
            bt = BackgroundTasks()
            background_tasks_holder.append(bt)
            return bt

        if name in path_params:
            return path_params[name]

        if _is_basemodel(annotation):
            body = request.json_body or {}
            return annotation(**body)

        if name in request.query:
            raw = request.query[name]
            return _coerce(raw, annotation)

        if default is inspect._empty:
            raise HTTPException(422, f"missing required parameter: {name}")
        return default


def TestClient_factory(app):
    return _Client(app)
