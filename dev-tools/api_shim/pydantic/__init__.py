"""
Minimal stand-in for pydantic — just enough BaseModel behavior for the app's
request-body models (LoginRequest, LoginResponse, ReviewDecision). Not a
real validation library: no type coercion/validation, just attribute
storage + defaults, which is all this codebase relies on.
"""
import typing


class _FieldSpec:
    __slots__ = ("name", "annotation", "default")

    def __init__(self, name, annotation, default):
        self.name = name
        self.annotation = annotation
        self.default = default


class BaseModelMeta(type):
    def __new__(mcs, name, bases, ns):
        cls = super().__new__(mcs, name, bases, ns)
        fields = {}
        for base in bases:
            fields.update(getattr(base, "__model_fields__", {}))
        annotations = ns.get("__annotations__", {})
        for fname, ftype in annotations.items():
            default = ns.get(fname, ...)
            fields[fname] = _FieldSpec(fname, ftype, default)
        cls.__model_fields__ = fields
        return cls


class BaseModel(metaclass=BaseModelMeta):
    def __init__(self, **data):
        for fname, spec in self.__model_fields__.items():
            if fname in data:
                setattr(self, fname, data[fname])
            elif spec.default is not ...:
                setattr(self, fname, spec.default)
            else:
                # required field missing -- mirror pydantic's loud failure
                raise ValueError(f"{type(self).__name__}: missing required field '{fname}'")

    def dict(self):
        return {f: getattr(self, f) for f in self.__model_fields__}

    def __repr__(self):
        fields = ", ".join(f"{k}={v!r}" for k, v in self.dict().items())
        return f"{type(self).__name__}({fields})"
