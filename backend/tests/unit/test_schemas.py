import pytest
from pydantic import ValidationError

import schemas

BLOCK = {"title": "Работа", "seconds": 1500, "color": "#30A46C"}


def test_user_create_strips_and_rejects_spaces():
    assert schemas.UserCreate(username="  bob  ", password="secret1").username == "bob"
    with pytest.raises(ValidationError):
        schemas.UserCreate(username="bo b", password="secret1")
    with pytest.raises(ValidationError):
        schemas.UserCreate(username="ab", password="secret1")


def test_timer_preset_defaults_and_normalization():
    p = schemas.TimerPresetIn(title="  Помодоро ", blocks=[BLOCK])
    assert p.title == "Помодоро"
    assert p.blocks[0].color == "#30a46c"
    assert (p.rounds, p.auto_continue, p.auto_delay, p.sound_start, p.sound_end) == (1, True, 5, "bell", "gong")


@pytest.mark.parametrize(
    "patch",
    [
        {"blocks": []},
        {"blocks": [BLOCK] * 21},
        {"rounds": 0},
        {"rounds": 100},
        {"break_seconds": 3601},
        {"auto_delay": 61},
        {"sound_end": "siren"},
        {"sound_start": "custom:abc"},
        {"blocks": [{**BLOCK, "seconds": 0}]},
        {"blocks": [{**BLOCK, "seconds": 600 * 60 + 60}]},
        {"blocks": [{**BLOCK, "color": "green"}]},
        {"title": ""},
    ],
)
def test_timer_preset_validation(patch):
    with pytest.raises(ValidationError):
        schemas.TimerPresetIn(**({"title": "T", "blocks": [BLOCK]} | patch))


@pytest.mark.parametrize("sound", ["none", "bell", "beep", "gong", "custom:15"])
def test_timer_sound_ids(sound):
    assert schemas.TimerPresetIn(title="T", blocks=[BLOCK], sound_start=sound).sound_start == sound


def test_custom_theme_requires_all_colors():
    with pytest.raises(ValidationError):
        schemas.SettingsBase(theme="custom")
    with pytest.raises(ValidationError):
        schemas.SettingsBase(theme="custom", custom_colors={"bg": "#000000"})


def test_export_checks_task_tags():
    with pytest.raises(ValidationError):
        schemas.ExportData(tags=[], tasks=[{"title": "x", "tags": ["work"]}])


def test_export_old_version_has_no_timers():
    data = schemas.ExportData.model_validate({"app": "traker000", "version": 2})
    assert data.timers is None
