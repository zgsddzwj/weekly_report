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


class OrganizationMemberOut(BaseModel):
    id: int
    name: str
    slug: str
    role: str


class GitConnectionCreate(BaseModel):
    provider: str = Field(pattern="^(github|gitlab|gitee)$")
    base_url: str
    label: str = Field(max_length=128)
    token: str = Field(min_length=8)


class GitConnectionOut(BaseModel):
    id: int
    organization_id: int
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
    schedule_cron: str | None = None
    schedule_enabled: bool = False
    schedule_timezone: str = "UTC"
    include_prs: bool = False
    diff_analysis_consent: bool = False


class ReportProfileOut(BaseModel):
    id: int
    organization_id: int
    name: str
    git_connection_id: int
    repo_full_names: str
    window_days: int
    filters: dict[str, Any]
    style: dict[str, Any]
    created_at: datetime
    schedule_cron: str | None
    schedule_enabled: bool
    schedule_timezone: str
    hook_public_token: str
    include_prs: bool
    diff_analysis_consent: bool

    model_config = {"from_attributes": True}


class ReportProfileUpdate(BaseModel):
    name: str | None = Field(None, max_length=128)
    git_connection_id: int | None = None
    repo_full_names: str | None = None
    window_days: int | None = Field(None, ge=1, le=90)
    filters: dict[str, Any] | None = None
    style: dict[str, Any] | None = None
    schedule_cron: str | None = None
    schedule_enabled: bool | None = None
    schedule_timezone: str | None = None
    include_prs: bool | None = None
    diff_analysis_consent: bool | None = None


class TemplatePresetOut(BaseModel):
    id: str
    label_zh: str
    label_en: str
    description_zh: str


class AuditEventOut(BaseModel):
    id: int
    action: str
    entity_type: str | None
    entity_id: int | None
    meta: dict[str, Any]
    client_ip: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportRunCreate(BaseModel):
    profile_id: int
    trigger_source: str = Field(default="manual", pattern="^(manual|api)$")


class ReportRunOut(BaseModel):
    id: int
    profile_id: int
    status: str
    result_markdown: str | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None
    profile_snapshot: dict[str, Any]
    trigger_source: str
    result_storage: str
    result_s3_bucket: str | None
    result_s3_key: str | None

    model_config = {"from_attributes": True}
