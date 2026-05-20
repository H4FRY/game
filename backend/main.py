from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

from game import GameRoom

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

room = GameRoom()
room_lock = asyncio.Lock()


async def send_error(websocket: WebSocket, message: str):
    await websocket.send_text(
        json.dumps(
            {
                "type": "error",
                "message": message,
            },
            ensure_ascii=False,
        )
    )


async def broadcast_state():
    state = room.get_state()
    disconnected = []

    for player in room.players:
        if not player.connected:
            continue

        try:
            await player.websocket.send_text(json.dumps(state, ensure_ascii=False))
        except Exception:
            disconnected.append(player.websocket)

    if disconnected:
        async with room_lock:
            for ws in disconnected:
                room.remove_player(ws)


@app.get("/")
async def root():
    return {
        "message": "Infinity Grid backend is running",
    }


@app.websocket("/ws/game")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    current_player = None

    try:
        join_raw = await websocket.receive_text()

        try:
            join_data = json.loads(join_raw)
        except json.JSONDecodeError:
            await send_error(websocket, "Некорректный JSON")
            await websocket.close()
            return

        if join_data.get("type") != "join":
            await send_error(websocket, "Первое сообщение должно быть типа join")
            await websocket.close()
            return

        name = str(join_data.get("name", "")).strip()

        if not name:
            await send_error(websocket, "Имя игрока обязательно")
            await websocket.close()
            return

        if len(name) > 20:
            await send_error(websocket, "Имя слишком длинное")
            await websocket.close()
            return

        async with room_lock:
            player = room.add_player(websocket, name)

        if player is None:
            await send_error(websocket, "Комната заполнена")
            await websocket.close()
            return

        current_player = player

        await websocket.send_text(
            json.dumps(
                {
                    "type": "joined",
                    "player": player.to_dict(),
                },
                ensure_ascii=False,
            )
        )

        await broadcast_state()

        while True:
            raw_message = await websocket.receive_text()

            try:
                data = json.loads(raw_message)
            except json.JSONDecodeError:
                await send_error(websocket, "Некорректный JSON")
                continue

            message_type = data.get("type")

            if message_type == "make_move":
                x = data.get("x")
                y = data.get("y")
                player_id = data.get("player_id")

                if player_id != current_player.id:
                    await send_error(websocket, "Некорректный id игрока")
                    continue

                async with room_lock:
                    success, message = room.make_move(current_player.id, x, y)

                if not success:
                    await send_error(websocket, message)

                await broadcast_state()

            elif message_type == "restart":
                async with room_lock:
                    room.reset_game()

                await broadcast_state()

            else:
                await send_error(websocket, "Неизвестный тип сообщения")

    except WebSocketDisconnect:
        if current_player is not None:
            async with room_lock:
                room.remove_player(websocket)

            await broadcast_state()

    except Exception as e:
        if current_player is not None:
            async with room_lock:
                room.remove_player(websocket)

            await broadcast_state()

        try:
            await send_error(websocket, f"Ошибка сервера: {str(e)}")
        except Exception:
            pass