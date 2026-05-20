from typing import List, Optional
from uuid import uuid4

WIN_LENGTH = 5
MAX_PLAYERS = 4

# Если нужно поле до ±999999, оставь так:
MAX_COORD = 999_999

# Если нужно до ±99 999 999, поставь так:
# MAX_COORD = 99_999_999

SYMBOLS = ["X", "O", "▽", "●"]


class Player:
    def __init__(self, websocket, name: str, symbol: str):
        self.id = str(uuid4())
        self.websocket = websocket
        self.name = name
        self.symbol = symbol
        self.connected = True

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "symbol": self.symbol,
            "connected": self.connected,
        }


class GameRoom:
    def __init__(self):
        self.players: List[Player] = []
        self.board: dict[str, str] = {}
        self.current_turn_index = 0
        self.started = False
        self.finished = False
        self.winner: Optional[str] = None
        self.winner_name: Optional[str] = None
        self.ranking = []
        self.last_move = None

    def reset_game(self):
        self.board = {}
        self.current_turn_index = 0
        self.started = len(self.get_active_players()) == MAX_PLAYERS
        self.finished = False
        self.winner = None
        self.winner_name = None
        self.ranking = []
        self.last_move = None

    def get_active_players(self) -> List["Player"]:
        return [p for p in self.players if p.connected]

    def get_current_player(self) -> Optional["Player"]:
        active_players = self.get_active_players()

        if not active_players:
            return None

        if self.current_turn_index >= len(active_players):
            self.current_turn_index = 0

        return active_players[self.current_turn_index]

    def add_player(self, websocket, name: str) -> Optional["Player"]:
        active_players = self.get_active_players()

        if len(active_players) >= MAX_PLAYERS:
            return None

        used_symbols = [p.symbol for p in active_players]
        available_symbol = next((s for s in SYMBOLS if s not in used_symbols), None)

        if available_symbol is None:
            return None

        player = Player(websocket, name, available_symbol)
        self.players.append(player)

        if len(self.get_active_players()) == MAX_PLAYERS:
            self.started = True
            self.finished = False
            self.winner = None
            self.winner_name = None
            self.ranking = []
            self.current_turn_index = 0
            self.last_move = None

        return player

    def remove_player(self, websocket):
        for player in self.players:
            if player.websocket == websocket:
                player.connected = False
                break

        active_players = self.get_active_players()

        if len(active_players) == 0:
            self.players = []
            self.board = {}
            self.current_turn_index = 0
            self.started = False
            self.finished = False
            self.winner = None
            self.winner_name = None
            self.ranking = []
            self.last_move = None
            return

        if len(active_players) < MAX_PLAYERS:
            self.started = False
            self.finished = False
            self.winner = None
            self.winner_name = None
            self.ranking = []
            self.last_move = None

        if self.current_turn_index >= len(active_players):
            self.current_turn_index = 0

    def cell_key(self, x: int, y: int) -> str:
        return f"{x},{y}"

    def get_cell(self, x: int, y: int) -> Optional[str]:
        return self.board.get(self.cell_key(x, y))

    def validate_coordinates(self, x: int, y: int):
        if not isinstance(x, int) or not isinstance(y, int):
            return False, "x и y должны быть целыми числами"

        if isinstance(x, bool) or isinstance(y, bool):
            return False, "x и y должны быть целыми числами"

        if abs(x) > MAX_COORD or abs(y) > MAX_COORD:
            return False, f"Координаты должны быть от -{MAX_COORD} до {MAX_COORD}"

        return True, None

    def make_move(self, player_id: str, x: int, y: int):
        if self.finished:
            return False, "Игра уже завершена"

        if not self.started:
            return False, "Игра начинается только когда подключены 4 игрока"

        if len(self.get_active_players()) != MAX_PLAYERS:
            return False, "Недостаточно игроков для игры"

        valid, error = self.validate_coordinates(x, y)
        if not valid:
            return False, error

        current_player = self.get_current_player()

        if current_player is None:
            return False, "Нет активного игрока"

        if current_player.id != player_id:
            return False, "Сейчас не ваш ход"

        key = self.cell_key(x, y)

        if key in self.board:
            return False, "Клетка уже занята"

        self.board[key] = current_player.symbol

        self.last_move = {
            "x": x,
            "y": y,
            "symbol": current_player.symbol,
            "player_name": current_player.name,
        }

        if self.check_winner(x, y, current_player.symbol):
            self.finished = True
            self.winner = current_player.symbol
            self.winner_name = current_player.name
            self.build_ranking(current_player)
            return True, "Победа"

        self.advance_turn()
        return True, "Ход выполнен"

    def advance_turn(self):
        active_players = self.get_active_players()

        if not active_players:
            return

        self.current_turn_index = (self.current_turn_index + 1) % len(active_players)

    def check_winner(self, x: int, y: int, symbol: str) -> bool:
        directions = [
            (1, 0),
            (0, 1),
            (1, 1),
            (1, -1),
        ]

        for dx, dy in directions:
            count = 1
            count += self.count_in_direction(x, y, dx, dy, symbol)
            count += self.count_in_direction(x, y, -dx, -dy, symbol)

            if count >= WIN_LENGTH:
                return True

        return False

    def count_in_direction(self, x: int, y: int, dx: int, dy: int, symbol: str) -> int:
        count = 0
        cx = x + dx
        cy = y + dy

        while self.get_cell(cx, cy) == symbol:
            count += 1
            cx += dx
            cy += dy

        return count

    def build_ranking(self, winner: "Player"):
        active_players = self.get_active_players()

        self.ranking = [
            {
                "place": 1,
                "name": winner.name,
                "symbol": winner.symbol,
            }
        ]

        others = [p for p in active_players if p.id != winner.id]

        for index, player in enumerate(others, start=2):
            self.ranking.append(
                {
                    "place": index,
                    "name": player.name,
                    "symbol": player.symbol,
                }
            )

    def get_state(self):
        current_player = self.get_current_player()

        return {
            "type": "state",
            "board": self.board,
            "players": [p.to_dict() for p in self.get_active_players()],
            "started": self.started,
            "finished": self.finished,
            "winner": self.winner,
            "winner_name": self.winner_name,
            "current_turn": current_player.symbol if current_player else None,
            "current_turn_id": current_player.id if current_player else None,
            "current_turn_name": current_player.name if current_player else None,
            "ranking": self.ranking,
            "win_length": WIN_LENGTH,
            "last_move": self.last_move,
            "max_coord": MAX_COORD,
            "moves_count": len(self.board),
        }