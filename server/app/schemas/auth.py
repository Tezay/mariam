from marshmallow import Schema, fields, EXCLUDE


class LoginSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    email = fields.Email(required=True, description="User email address")
    password = fields.Str(required=True, description="User password")


class LoginResponseSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    message = fields.Str()
    user = fields.Dict(description="User object (present when fully authenticated)")
    access_token = fields.Str(description="JWT access token")
    refresh_token = fields.Str(description="JWT refresh token")
    mfa_required = fields.Bool(description="True if MFA step is required")
    mfa_token = fields.Str(description="Temporary MFA token for step 2")


class MFAVerifySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    mfa_token = fields.Str(required=True, description="Temporary MFA token from login step 1")
    code = fields.Str(required=True, description="6-digit TOTP code")


class MFAVerifySetupSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    user_id = fields.Int(required=True, description="User ID from activation response")
    code = fields.Str(required=True, description="6-digit TOTP code to confirm setup")


class ActivateAccountSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    token = fields.Str(required=True, description="Activation link token")
    password = fields.Str(required=True, description="New password (min 12 chars)")
    email = fields.Email(description="Email (required only if not embedded in the link)")
    username = fields.Str(description="Display name (optional)")


class ResetPasswordSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    token = fields.Str(required=True, description="Password reset link token")
    new_password = fields.Str(required=True, description="New password (min 12 chars)")
    mfa_code = fields.Str(required=True, description="Current TOTP code for verification")


class ChangePasswordSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    current_password = fields.Str(required=True, description="Current password")
    new_password = fields.Str(required=True, description="New password (min 12 chars)")
    mfa_code = fields.Str(required=True, description="Current TOTP code")


class TokenRefreshSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    access_token = fields.Str(description="New JWT access token")


class UserSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    user = fields.Dict(description="Authenticated user object")
