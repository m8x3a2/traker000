import io
import wave

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_admin
from cache import cache, etag_response
from config import SOUND_MAX_BYTES, SOUND_MAX_SECONDS
from database import get_db
from docs import err

router = APIRouter(tags=["Звуки таймера"])

ALLOWED_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/ogg",
    "audio/webm", "audio/mp4", "audio/x-m4a", "audio/aac",
}


def sound_options() -> list[dict]:
    return [schemas.SoundOption(id=k, name=v, builtin=True).model_dump() for k, v in schemas.BUILTIN_SOUNDS.items()]


@router.get("/sounds", response_model=list[schemas.SoundOption], summary="Доступные звуки", responses=err(304))
def list_sounds(request: Request, response: Response, db: Session = Depends(get_db)):
    """Три стандартных звука (генерируются в браузере) и звуки, загруженные администратором."""
    def load():
        custom = db.query(models.TimerSound).order_by(models.TimerSound.id).all()
        return sound_options() + [
            schemas.SoundOption(id=f"custom:{s.id}", name=s.name, builtin=False, url=f"/sounds/{s.id}/file").model_dump()
            for s in custom
        ]

    data, hit = cache.get_or_set("sounds:list", load)
    return etag_response(request, response, data, max_age=60, hit=hit)


@router.get("/sounds/{sound_id}/file", summary="Файл звука", responses=err(304, 404))
def sound_file(sound_id: int, request: Request, db: Session = Depends(get_db)):
    """Аудиофайл. Файл с данным id не меняется, поэтому браузер может кэшировать его надолго."""
    sound = db.get(models.TimerSound, sound_id)
    if sound is None:
        raise HTTPException(status_code=404, detail="Звук не найден")
    etag = f'"sound-{sound.id}-{sound.size}"'
    headers = {"ETag": etag, "Cache-Control": "public, max-age=86400, immutable"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=sound.data, media_type=sound.content_type, headers=headers)


# ---------- Администратор ----------

admin_router = APIRouter(prefix="/admin/sounds", tags=["Администрирование"], dependencies=[Depends(require_admin)])


def wav_duration_ms(data: bytes) -> int | None:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return round(w.getnframes() * 1000 / w.getframerate())
    except (wave.Error, EOFError, ZeroDivisionError):
        return None


@admin_router.get("", response_model=list[schemas.TimerSoundOut], summary="Загруженные звуки", responses=err(401, 403))
def admin_list_sounds(db: Session = Depends(get_db)):
    return db.query(models.TimerSound).order_by(models.TimerSound.id).all()


@admin_router.post(
    "", response_model=schemas.TimerSoundOut, status_code=status.HTTP_201_CREATED,
    summary="Загрузить звук", responses=err(400, 401, 403, 413, 415, 422),
)
async def upload_sound(
    file: UploadFile = File(description=f"Аудиофайл до {SOUND_MAX_SECONDS} секунд"),
    name: str = Form(min_length=1, max_length=40),
    duration_ms: int = Form(ge=1, description="Длительность, измеренная браузером (для WAV проверяется сервером)"),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    content_type = (file.content_type or "").split(";")[0].lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Поддерживаются MP3, WAV, OGG, WEBM, M4A")
    data = await file.read(SOUND_MAX_BYTES + 1)
    if len(data) > SOUND_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Файл больше {SOUND_MAX_BYTES // 1024} КБ")
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if "wav" in content_type:
        real = wav_duration_ms(data)
        if real is None:
            raise HTTPException(status_code=400, detail="Файл WAV повреждён")
        duration_ms = real
    if duration_ms > SOUND_MAX_SECONDS * 1000:
        raise HTTPException(status_code=400, detail=f"Звук длиннее {SOUND_MAX_SECONDS} секунд")
    sound = models.TimerSound(
        name=name.strip(), content_type=content_type, data=data, size=len(data),
        duration_ms=duration_ms, uploaded_by=admin.id,
    )
    db.add(sound)
    db.commit()
    db.refresh(sound)
    cache.invalidate("sounds:")
    return sound


@admin_router.delete("/{sound_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить звук", responses=err(401, 403, 404))
def delete_sound(sound_id: int, db: Session = Depends(get_db)):
    """Шаблоны таймера, в которых был выбран этот звук, переключаются на стандартный."""
    sound = db.get(models.TimerSound, sound_id)
    if sound is None:
        raise HTTPException(status_code=404, detail="Звук не найден")
    ref = f"custom:{sound_id}"
    db.query(models.TimerPreset).filter(models.TimerPreset.sound_start == ref).update({"sound_start": "bell"})
    db.query(models.TimerPreset).filter(models.TimerPreset.sound_end == ref).update({"sound_end": "gong"})
    db.delete(sound)
    db.commit()
    cache.invalidate("sounds:")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
