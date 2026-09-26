"""
Minimal SQLModel-compatible shim, backed by a REAL sqlite3 database (not an
in-memory fake) — this exists only because this sandbox has no network
access to `pip install sqlmodel`. It implements exactly the subset of the
SQLModel/SQLAlchemy API that backend/app/models/*.py and app/api/*.py
actually use (checked by grep):

    SQLModel, Field(default=, default_factory=, primary_key=, index=,
    unique=, foreign_key=, alias=), Session, create_engine, select(Model),
    Query.where()/.offset()/.limit(), session.exec/.add/.delete/.commit/
    .refresh, Model.field == value, Model.field.is_(None)

Every read/write goes through real SQL against a real sqlite3 file, so
this exercises genuine persistence semantics (autoincrement ids, row
round-tripping, WHERE filtering) rather than a Python-list fake.
"""
import sqlite3
import typing
from datetime import datetime


def _unwrap_optional(annotation):
    if typing.get_origin(annotation) is typing.Union:
        args = [a for a in typing.get_args(annotation) if a is not type(None)]
        if len(args) == 1:
            return args[0]
    return annotation


_SQL_TYPES = {int: "INTEGER", float: "REAL", bool: "INTEGER", str: "TEXT", datetime: "TEXT"}


class FieldInfo:
    def __init__(self, default=None, default_factory=None, primary_key=False,
                 index=False, unique=False, foreign_key=None, alias=None):
        self.default = default
        self.default_factory = default_factory
        self.primary_key = primary_key
        self.index = index
        self.unique = unique
        self.foreign_key = foreign_key
        self.alias = alias


def Field(default=None, default_factory=None, primary_key=False, index=False,
          unique=False, foreign_key=None, alias=None, **kwargs):
    return FieldInfo(default=default, default_factory=default_factory, primary_key=primary_key,
                      index=index, unique=unique, foreign_key=foreign_key, alias=alias)


class Condition:
    def __init__(self, field, op, value):
        self.field = field
        self.op = op
        self.value = value


class ColumnProxy:
    def __init__(self, field_name):
        self.field_name = field_name

    def __eq__(self, other):
        return Condition(self.field_name, "=", other)

    def is_(self, value):
        return Condition(self.field_name, "IS", value)

    __hash__ = object.__hash__


class _Metadata:
    def __init__(self):
        self.tables = []  # list of model classes with table=True

    def create_all(self, engine):
        conn = engine.connection
        for model in self.tables:
            cols = []
            for name, (annotation, info) in model.__fields__.items():
                base_type = _unwrap_optional(annotation)
                sql_type = _SQL_TYPES.get(base_type, "TEXT")
                col = f'"{name}" {sql_type}'
                if info.primary_key:
                    col += " PRIMARY KEY AUTOINCREMENT"
                cols.append(col)
            ddl = f'CREATE TABLE IF NOT EXISTS "{model.__tablename__}" ({", ".join(cols)})'
            conn.execute(ddl)
        conn.commit()


class SQLModelMeta(type):
    def __new__(mcs, name, bases, ns, table=False, **kwargs):
        cls = super().__new__(mcs, name, bases, ns)
        if name == "SQLModel":
            cls.metadata = _Metadata()
            return cls

        fields = {}
        for base in bases:
            fields.update(getattr(base, "__fields__", {}))
        annotations = ns.get("__annotations__", {})
        for fname, ftype in annotations.items():
            raw_default = ns.get(fname, None)
            info = raw_default if isinstance(raw_default, FieldInfo) else FieldInfo(default=raw_default)
            fields[fname] = (ftype, info)
        cls.__fields__ = fields

        if not hasattr(cls, "__tablename__"):
            cls.__tablename__ = name.lower()

        for fname in fields:
            setattr(cls, fname, ColumnProxy(fname))

        if table:
            SQLModel.metadata.tables.append(cls)
        return cls


class SQLModel(metaclass=SQLModelMeta):
    def __init__(self, **data):
        for fname, (ftype, info) in self.__fields__.items():
            if fname in data:
                setattr(self, fname, data[fname])
            elif info.default_factory is not None:
                setattr(self, fname, info.default_factory())
            else:
                setattr(self, fname, info.default)

    def dict(self, exclude=None):
        exclude = exclude or set()
        return {f: getattr(self, f) for f in self.__fields__ if f not in exclude}

    def __repr__(self):
        return f"{type(self).__name__}({self.dict()})"


def _row_to_model(model, row_dict):
    obj = model.__new__(model)
    for fname, (ftype, info) in model.__fields__.items():
        base_type = _unwrap_optional(ftype)
        value = row_dict.get(fname)
        if value is not None:
            if base_type is bool:
                value = bool(value)
            elif base_type is datetime and isinstance(value, str):
                value = datetime.fromisoformat(value)
        setattr(obj, fname, value)
    obj._loaded_from_db = True
    pk_field = _pk_field(model)
    obj._original_pk = getattr(obj, pk_field)
    return obj


def _pk_field(model):
    for fname, (ftype, info) in model.__fields__.items():
        if info.primary_key:
            return fname
    return "id"


def _to_sql_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bool):
        return int(value)
    return value


class Query:
    def __init__(self, model):
        self.model = model
        self.conditions = []
        self._offset = None
        self._limit = None

    def where(self, condition):
        self.conditions.append(condition)
        return self

    def offset(self, n):
        self._offset = n
        return self

    def limit(self, n):
        self._limit = n
        return self

    def to_sql(self):
        sql = f'SELECT * FROM "{self.model.__tablename__}"'
        params = []
        if self.conditions:
            clauses = []
            for cond in self.conditions:
                if cond.op == "IS":
                    clauses.append(f'"{cond.field}" IS NULL')
                else:
                    clauses.append(f'"{cond.field}" {cond.op} ?')
                    params.append(_to_sql_value(cond.value))
            sql += " WHERE " + " AND ".join(clauses)
        if self._limit is not None:
            sql += f" LIMIT {int(self._limit)}"
        if self._offset is not None:
            sql += f" OFFSET {int(self._offset)}"
        return sql, params


def select(model):
    return Query(model)


class ExecResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None

    def __iter__(self):
        return iter(self._items)


class Engine:
    def __init__(self, connection, url):
        self.connection = connection
        self.url = url


def create_engine(url, echo=False, connect_args=None):
    # Always backed by a real sqlite3 database. Non-sqlite URLs (e.g. the
    # docker-compose postgresql+psycopg2:// one) fall back to an on-disk
    # sqlite file instead — there's no psycopg2/Postgres available in this
    # sandbox either, and the point of this shim is to exercise the app's
    # *logic*, which is identical regardless of which SQL engine sits under
    # it. This is called out explicitly wherever it's used.
    if url.startswith("sqlite:///"):
        path = url[len("sqlite:///"):] or ":memory:"
    else:
        path = "./storage/_shim_fallback.db"
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return Engine(conn, url)


class Session:
    def __init__(self, engine):
        self.engine = engine
        self.conn = engine.connection
        self._pending_adds = []
        self._pending_deletes = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def exec(self, query):
        sql, params = query.to_sql()
        cur = self.conn.execute(sql, params)
        rows = cur.fetchall()
        items = [_row_to_model(query.model, dict(row)) for row in rows]
        return ExecResult(items)

    def add(self, obj):
        self._pending_adds.append(obj)

    def delete(self, obj):
        self._pending_deletes.append(obj)

    def commit(self):
        for obj in self._pending_adds:
            model = type(obj)
            pk_field = _pk_field(model)
            if getattr(obj, "_loaded_from_db", False):
                set_cols = [f for f in model.__fields__ if f != pk_field]
                sql = (f'UPDATE "{model.__tablename__}" SET '
                       + ", ".join(f'"{c}" = ?' for c in set_cols)
                       + f' WHERE "{pk_field}" = ?')
                params = [_to_sql_value(getattr(obj, c)) for c in set_cols]
                params.append(obj._original_pk)
                self.conn.execute(sql, params)
            else:
                cols = [f for f in model.__fields__ if f != pk_field or getattr(obj, pk_field) is not None]
                values = [_to_sql_value(getattr(obj, c)) for c in cols]
                placeholders = ", ".join("?" for _ in cols)
                col_list = ", ".join(f'"{c}"' for c in cols)
                cur = self.conn.execute(
                    f'INSERT INTO "{model.__tablename__}" ({col_list}) VALUES ({placeholders})', values
                )
                setattr(obj, pk_field, cur.lastrowid)
                obj._loaded_from_db = True
                obj._original_pk = cur.lastrowid
        for obj in self._pending_deletes:
            model = type(obj)
            pk_field = _pk_field(model)
            self.conn.execute(
                f'DELETE FROM "{model.__tablename__}" WHERE "{pk_field}" = ?',
                [getattr(obj, "_original_pk", getattr(obj, pk_field))],
            )
        self.conn.commit()
        self._pending_adds = []
        self._pending_deletes = []

    def rollback(self):
        self._pending_adds = []
        self._pending_deletes = []

    def refresh(self, obj):
        model = type(obj)
        pk_field = _pk_field(model)
        cur = self.conn.execute(
            f'SELECT * FROM "{model.__tablename__}" WHERE "{pk_field}" = ?', [getattr(obj, pk_field)]
        )
        row = cur.fetchone()
        if row:
            fresh = _row_to_model(model, dict(row))
            for fname in model.__fields__:
                setattr(obj, fname, getattr(fresh, fname))

    def close(self):
        pass
