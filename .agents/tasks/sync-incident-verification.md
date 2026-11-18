# проверка после аварии 2026-11-18 (массовое удаление заметок)

список на прогон после каждого релиза, который трогает синк, и просто когда «заметки пропали».
записан по горячим следам: каждое число ниже я в этот день видела своими глазами.

## что должно быть верно всегда

- `state.json.sync.tombstones` растёт только вместе с реальными удалениями. 84 записи на vault
  из 85 заметок — это не «человек почистил», это авария.
- пуш с удалениями **маленький**: 84 delete-изменения весят ~5 КБ. полный пуш 85 заметок —
  ~90 КБ. бандл на 5 КБ при счёте изменений, близком к числу заметок, — красный флаг.
- после старта в логе нет `Imported vault data: <мало> items` и `removed: N` пачкой.
  нормальный старт: `initialized itemsCount:0` → `Loaded N notes` → `Connected` → пуш на N+ изменений.

## пк (windows)

```powershell
$m = "$env:APPDATA\com.slag.notes\vaults\main"
(Get-ChildItem "$m\notes" -Recurse -Filter *.md).Count                     # столько же, сколько было
((Get-Content "$m\state.json" -Raw | ConvertFrom-Json).sync.tombstones.PSObject.Properties).Count  # 0..мало
Select-String -Path "$env:APPDATA\com.slag.notes\logs\slag-$(Get-Date -f yyyy-MM-dd).log" `
  -Pattern "action=delete|Imported vault data: [0-9] items|Moved .* to \.trash" | Select-Object -Last 10
```

ожидаемо: число заметок не изменилось между двумя запусками; надгробий нет или единицы; в логе нет
пачки `Moved … to .trash` и нет `action=delete`.

## ноут (endeavouros, ssh `laptop`)

```bash
V=~/.local/share/com.slag.notes/vaults/vault_3721cd28-be7a-47f9-aa71-267d341b5121
find "$V/notes" -name '*.md' | wc -l
python3 -c "import json;s=json.load(open('$V/state.json'))['sync'];print(len(s['tombstones']),len(s['outbox']))"
tail -n 50 ~/.local/share/com.slag.notes/logs/slag-$(date +%F).log | grep -E 'Received bundle|Moved|Imported'
```

скрипт гонять через `bash -s`, а не `ssh "…"`: кавычки в powershell съедают `2>/dev/null` и `$d`.

## телефон (adb over wifi)

```powershell
$adb = "C:\Users\morii\.dsh-tools\platform-tools\adb.exe"
& $adb connect <ip>:<port>; & $adb devices
& $adb shell "dumpsys package com.slag.notes | grep -m1 versionName"
& $adb shell screencap -p /sdcard/s.png; & $adb pull /sdcard/s.png shot.png
```

апк релизный, не debuggable: `run-as` и чтение `files/` недоступны, считать заметки изнутри нельзя.
единственные источники — скриншот и бандлы, которые телефон присылает на релей (в логе пк
`Received bundle … from slag-…`).

## как восстанавливать, если повторилось

1. закрыть приложение на всех устройствах (`Stop-Process slag-v2`, `pkill -f slag-v2`,
   `adb shell am force-stop com.slag.notes`) — пока оно живо, оно продолжит рассылать состояние.
2. пк: скопировать `.trash` целиком в отдельную папку, вернуть файлы, чьи id лежат в
   `state.json.sync.tombstones`, в `notes/`; поставить им `updated:` = сейчас (иначе их отвергнут
   чужие надгробия — LWW сравнивает именно этот штамп).
3. обнулить `sync.tombstones`, `sentHashes`, `stateHash`, `outbox` (бэкап файла рядом).
4. поднять **одно** устройство и убедиться, что пуш ушёл и он полный.
5. остальные — после. их надгробия снимутся сами: новые штампы заметок старше не бывают.

## чего в этом списке нет

счётчик в корзине. он ничего не доказывает: восстановление я делала копированием, поэтому файлы
лежат и в `notes/`, и в `.trash`. дубли в корзине безвредны, но пугают при просмотре.
