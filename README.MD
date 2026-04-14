 # Infinity Grid

Многопользовательская веб-игра на **FastAPI + React + WebSocket** с большим игровым полем, ходами в реальном времени и подключением игроков по локальной сети.

## Что реализовано

- подключение до **4 игроков**
- игра стартует только когда подключены **все 4 игрока**
- обмен ходами в реальном времени через **WebSocket**
- большое координатное поле
- поддержка координат до **±99 999 999**
- проверка победы по правилу **5 в ряд**
- цветные символы игроков
- отображение текущего хода
- рейтинг после окончания игры
- перезапуск игры
- подключение с других устройств по **IP в одной Wi-Fi сети**
- масштабирование поля
- перемещение по полю
- переход к нужным координатам

---

## Стек проекта

### Backend
- Python
- FastAPI
- Uvicorn
- WebSocket

### Frontend
- React
- JavaScript
- Vite
- CSS

---

## Структура проекта

```text
project/
├── backend/
│   ├── main.py
│   ├── game.py
│   ├── requirements.txt
│   └── .venv/
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    └── vite.config.js
```

## Команды запуска

### Backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
### Backend
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```