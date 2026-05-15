from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

class PasswordIn(BaseModel):
    password: str

@router.post("/setup")
def setup(body: PasswordIn, db: Session = Depends(get_db)):
    existing = db.query(User).first()
    if existing and existing.setup_complete:
        raise HTTPException(status_code=400, detail="Already set up")
    if existing:
        existing.password_hash = hash_password(body.password)
        existing.setup_complete = True
    else:
        user = User(id=1, password_hash=hash_password(body.password), setup_complete=True)
        db.add(user)
    db.commit()
    token = create_access_token({"sub": str(1)})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login")
def login(body: PasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == 1).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/logout")
def logout():
    return {"message": "Logged out"}  # token deletion handled client-side
