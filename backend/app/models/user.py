from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: Optional[str] = Field(default=None, unique=True)
    password_hash: str
    full_name: Optional[str] = None
    role: str = Field(default="operator")

    # Optional employer. Operators from the same company share an
    # organization name, which is what groups them on the profile page.
    organization: Optional[str] = Field(default=None, index=True)
    job_title: Optional[str] = None
    status: str = Field(default="active")  # 'active' | 'suspended'

    created_at: datetime = Field(default_factory=datetime.utcnow)
