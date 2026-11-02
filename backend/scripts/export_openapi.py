"""Сохраняет спецификацию OpenAPI в docs/openapi.json (для импорта в Postman, генерации клиентов, ревью API).
Запуск из папки backend:  python scripts/export_openapi.py"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", "sqlite://")  # подключение к БД для генерации схемы не нужно

from main import app  # noqa: E402

out = ROOT.parent / "docs" / "openapi.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
spec = app.openapi()
print(f"{out}: {len(spec['paths'])} путей, {sum(len(v) for v in spec['paths'].values())} операций")
