from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr

    model_config = {"from_attributes": True}


class GitConnectionCreate(BaseModel):
    provider: str = Field(pattern="^(github|gitlab)$")
    base_url: str
    label: str = Field(max_length=128)
    token: str = Field(min_length=8)


class GitConnectionOut(BaseModel):
    id: int
    provider: str
    base_url: str
    label: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportProfileCreate(BaseModel):
    name: str = Field(max_length=128)
    git_connection_id: int
    repo_full_names: str
    window_days: int = Field(default=7, ge=1, le=90)
    filters: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)


class ReportProfileOut(BaseModel):
    id: int
    name: str
    git_connection_id: int
    repo_full_names: str
    window_days: int
    filters: dict[str, Any]
    style: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportRunCreate(BaseModel):
    profile_id: int


class ReportRunOut(BaseModel):
    id: int
    profile_id: int
    status: str
    result_markdown: str | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
