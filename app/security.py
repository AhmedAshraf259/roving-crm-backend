from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

# إعدادات التشفير والـ JWT
SECRET_KEY = "YOUR_SUPER_SECRET_KEY_CHANGE_THIS_IN_PRODUCTION"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 ساعة

password_hash = PasswordHash((BcryptHasher(),))


def hash_password(password: str) -> str:
    return password_hash.hash(password[:72])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password[:72], hashed_password)


def create_token(
    data: dict | str | int, expires_delta: timedelta | None = None
) -> str:
    # إذا كانت البيانات الممررة ليست dict، نضعها داخل dict بفرع sub
    if not isinstance(data, dict):
        to_encode = {"sub": str(data)}
    else:
        to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt