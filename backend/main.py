from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

from game import GameRoom
MAX_COORD = 99_999_999
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

room = GameRoom()


async def send_error(websocket: WebSocket, message: str):
    print("SEND ERROR:", message)
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

    print("BROADCAST STATE:", state)

    for player in room.players:
        if not player.connected:
            continue
        try:
            await player.websocket.send_text(json.dumps(state, ensure_ascii=False))
        except Exception as e:
            print("BROADCAST FAILED:", e)
            disconnected.append(player.websocket)

    for ws in disconnected:
        room.remove_player(ws)


@app.get("/")
async def root():
    return {"message": "Four-player Tic-Tac-Toe backend is running"}


@app.websocket("/ws/game")
async def websocket_endpoint(websocket: WebSocket):
    print("WS: incoming connection")
    await websocket.accept()
    print("WS: accepted")
    current_player = None

    try:
        join_raw = await websocket.receive_text()
        print("WS FIRST MESSAGE:", join_raw)

        join_data = json.loads(join_raw)

        if join_data.get("type") != "join":
            await send_error(websocket, "Первое сообщение должно быть типа join")
            await websocket.close()
            return

        name = str(join_data.get("name", "")).strip()
        print("WS PLAYER NAME:", name)

        if not name:
            await send_error(websocket, "Имя игрока обязательно")
            await websocket.close()
            return

        if len(name) > 20:
            await send_error(websocket, "Имя слишком длинное")
            await websocket.close()
            return

        player = room.add_player(websocket, name)
        if player is None:
            await send_error(websocket, "Комната заполнена")
            await websocket.close()
            return

        current_player = player
        print("WS PLAYER JOINED:", player.name, player.symbol)

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
            print("WS MESSAGE:", raw_message)

            data = json.loads(raw_message)
            message_type = data.get("type")

            if message_type == "make_move":
                x = data.get("x")
                y = data.get("y")

                if not isinstance(x, int) or not isinstance(y, int):
                    await send_error(websocket, "x и y должны быть числами")
                    continue

                success, message = room.make_move(player.id, x, y)
                print("MOVE RESULT:", success, message)

                if not success:
                    await send_error(websocket, message)

                await broadcast_state()

            elif message_type == "restart":
                print("RESTART GAME")
                room.reset_game()
                await broadcast_state()

            else:
                await send_error(websocket, "Неизвестный тип сообщения")

    except WebSocketDisconnect:
        print("WS DISCONNECT")
        if current_player is not None:
            room.remove_player(websocket)
            await broadcast_state()

    except Exception as e:
        print("WS EXCEPTION:", repr(e))
        if current_player is not None:
            room.remove_player(websocket)
            await broadcast_state()
        try:
            await send_error(websocket, f"Ошибка сервера: {str(e)}")
        except Exception:
            pass