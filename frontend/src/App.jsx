
import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL = `ws://${window.location.hostname}:8000/ws/game`;

const SYMBOL_COLORS = {
  X: "#a855f7",
  O: "#06b6d4",
  "▽": "#f59e0b",
  "●": "#ec4899",
  "✕": "#a855f7",
  "◯": "#06b6d4",
  "▲": "#f59e0b",
  "◆": "#ec4899",
};

const MIN_CELL_SIZE = 28;
const MAX_CELL_SIZE = 88;
const DEFAULT_CELL_SIZE = 56;
const CELL_GAP = 6;

export default function App() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [myPlayer, setMyPlayer] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Не подключено");

  const [offsetX, setOffsetX] = useState(-10);
  const [offsetY, setOffsetY] = useState(-8);
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_SIZE);

  const [jumpX, setJumpX] = useState("0");
  const [jumpY, setJumpY] = useState("0");

  const [viewport, setViewport] = useState({
    width: 1200,
    height: 700,
  });

  const wsRef = useRef(null);
  const boardWrapRef = useRef(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    function updateViewport() {
      if (!boardWrapRef.current) return;

      const rect = boardWrapRef.current.getBoundingClientRect();
      setViewport({
        width: rect.width,
        height: rect.height,
      });
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    function handleMouseUp() {
      dragRef.current.active = false;
    }

    function handleMouseMove(e) {
      if (!dragRef.current.active) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      const step = cellSize + CELL_GAP;

      const shiftX = Math.round(deltaX / step);
      const shiftY = Math.round(deltaY / step);

      setOffsetX(dragRef.current.startOffsetX - shiftX);
      setOffsetY(dragRef.current.startOffsetY - shiftY);
    }

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [cellSize]);

  function connectToGame() {
    setError("");

    if (!name.trim()) {
      setError("Введите имя");
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Подключено");
      ws.send(
        JSON.stringify({
          type: "join",
          name: name.trim(),
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "joined") {
          setMyPlayer(data.player);
          setJoined(true);
          setError("");
        } else if (data.type === "state") {
          setGameState(data);
        } else if (data.type === "error") {
          setError(data.message || "Ошибка");
        }
      } catch (e) {
        console.error("JSON parse error:", e);
        setError("Ошибка обработки сообщения сервера");
      }
    };

    ws.onclose = (event) => {
      setStatus(`Соединение закрыто (${event.code})`);
    };

    ws.onerror = () => {
      setError("Ошибка WebSocket");
      setStatus("Ошибка соединения");
    };
  }

  function handleCellClick(x, y) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!gameState || gameState.finished || !gameState.started) return;

    wsRef.current.send(
      JSON.stringify({
        type: "make_move",
        x,
        y,
      })
    );
  }

  function handleRestart() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "restart",
      })
    );
  }

  function zoomIn() {
    setCellSize((prev) => Math.min(prev + 8, MAX_CELL_SIZE));
  }

  function zoomOut() {
    setCellSize((prev) => Math.max(prev - 8, MIN_CELL_SIZE));
  }

  function handleWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    setCellSize((prev) => {
      const next = e.deltaY > 0 ? prev - 4 : prev + 4;
      return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, next));
    });
  }

  function handleMouseDown(e) {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
  }

  function moveLeft() {
    setOffsetX((prev) => prev - 3);
  }

  function moveRight() {
    setOffsetX((prev) => prev + 3);
  }

  function moveUp() {
    setOffsetY((prev) => prev - 3);
  }

  function moveDown() {
    setOffsetY((prev) => prev + 3);
  }

  const players = gameState?.players || [];
  const boardMap = gameState?.board || {};
  const lastMove = gameState?.last_move || null;
  const maxCoord = gameState?.max_coord ?? 99999999;

  const isMyTurn =
    gameState &&
    myPlayer &&
    gameState.current_turn === myPlayer.symbol &&
    !gameState.finished &&
    gameState.started;

  const visibleCols = Math.max(
    8,
    Math.ceil(viewport.width / (cellSize + CELL_GAP)) + 2
  );

  const visibleRows = Math.max(
    8,
    Math.ceil(viewport.height / (cellSize + CELL_GAP)) + 2
  );

  const visibleCells = useMemo(() => {
    const cells = [];

    for (let row = 0; row < visibleRows; row++) {
      for (let col = 0; col < visibleCols; col++) {
        const x = offsetX + col;
        const y = offsetY + row;
        const key = `${x},${y}`;
        const symbol = boardMap[key] || null;

        cells.push({
          x,
          y,
          key,
          symbol,
        });
      }
    }

    return cells;
  }, [offsetX, offsetY, boardMap, visibleCols, visibleRows]);

  function goToCoords() {
    const x = Number(jumpX);
    const y = Number(jumpY);

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      setError("Введите целые координаты");
      return;
    }

    if (Math.abs(x) > maxCoord || Math.abs(y) > maxCoord) {
      setError(`Диапазон координат: от -${maxCoord} до ${maxCoord}`);
      return;
    }

    setError("");
    setOffsetX(x - Math.floor(visibleCols / 2));
    setOffsetY(y - Math.floor(visibleRows / 2));
  }

  function centerOnLastMove() {
    if (!lastMove) return;

    setOffsetX(lastMove.x - Math.floor(visibleCols / 2));
    setOffsetY(lastMove.y - Math.floor(visibleRows / 2));
  }

  function renderCell(cell) {
    const isFilled = !!cell.symbol;
    const isLastMove =
      lastMove && lastMove.x === cell.x && lastMove.y === cell.y;

    return (
      <button
        key={cell.key}
        className={`cell ${isLastMove ? "last-move" : ""}`}
        onClick={() => handleCellClick(cell.x, cell.y)}
        disabled={!isMyTurn || isFilled}
        title={`x: ${cell.x}, y: ${cell.y}`}
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          color: cell.symbol ? SYMBOL_COLORS[cell.symbol] || "#ffffff" : "#ffffff",
        }}
      >
        <span className="cell-symbol">{cell.symbol || ""}</span>
      </button>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <h1>Infinity Grid</h1>

        {!joined ? (
          <div className="card">
            <h2>Вход в игру</h2>
            <input
              type="text"
              placeholder="Введите имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
            />
            <button onClick={connectToGame}>Подключиться</button>
            <p className="status">{status}</p>
            <p className="status">WS: {WS_URL}</p>
            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <>
            <div className="top-panel">
              <div className="card small">
                <h3>Ты</h3>
                <p>
                  <strong>{myPlayer?.name}</strong>
                </p>
                <p>
                  Символ:{" "}
                  <span
                    style={{
                      color: SYMBOL_COLORS[myPlayer?.symbol] || "#ffffff",
                      fontWeight: 800,
                      fontSize: "22px",
                    }}
                  >
                    {myPlayer?.symbol}
                  </span>
                </p>
              </div>

              <div className="card small">
                <h3>Статус игры</h3>
                {!gameState?.started ? (
                  <p>Ожидание всех игроков: {players.length}/4</p>
                ) : gameState?.finished ? (
                  gameState.winner_name ? (
                    <p>
                      Победитель: <strong>{gameState.winner_name}</strong>{" "}
                      <span
                        style={{
                          color: SYMBOL_COLORS[gameState.winner] || "#ffffff",
                          fontWeight: 800,
                        }}
                      >
                        ({gameState.winner})
                      </span>
                    </p>
                  ) : (
                    <p>Ничья</p>
                  )
                ) : (
                  <p>
                    Сейчас ход: <strong>{gameState?.current_turn_name}</strong>{" "}
                    <span
                      style={{
                        color: SYMBOL_COLORS[gameState?.current_turn] || "#ffffff",
                        fontWeight: 800,
                      }}
                    >
                      ({gameState?.current_turn})
                    </span>
                  </p>
                )}
              </div>

              <div className="card small">
                <h3>Игроки</h3>
                {players.length === 0 ? (
                  <p>Нет игроков</p>
                ) : (
                  <ul className="players-list">
                    {players.map((player) => (
                      <li key={player.id}>
                        {player.name} —{" "}
                        <span
                          style={{
                            color: SYMBOL_COLORS[player.symbol] || "#ffffff",
                            fontWeight: 800,
                          }}
                        >
                          {player.symbol}
                        </span>
                        {gameState?.current_turn === player.symbol &&
                        !gameState?.finished
                          ? " ← ход"
                          : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="toolbar">
              <div className="card small">
                <h3>Перемещение</h3>
                <div className="nav-grid">
                  <button onClick={moveUp}>↑</button>
                  <div className="nav-row">
                    <button onClick={moveLeft}>←</button>
                    <button onClick={moveRight}>→</button>
                  </div>
                  <button onClick={moveDown}>↓</button>
                </div>
              </div>

              <div className="card small">
                <h3>Масштаб</h3>
                <div className="zoom-row">
                  <button onClick={zoomOut}>−</button>
                  <span className="zoom-value">{cellSize}px</span>
                  <button onClick={zoomIn}>+</button>
                </div>
              </div>

              <div className="card small">
                <h3>Переход к координатам</h3>
                <input
                  type="number"
                  value={jumpX}
                  onChange={(e) => setJumpX(e.target.value)}
                  placeholder="X"
                />
                <input
                  type="number"
                  value={jumpY}
                  onChange={(e) => setJumpY(e.target.value)}
                  placeholder="Y"
                />
                <button onClick={goToCoords}>Перейти</button>
                <button onClick={centerOnLastMove} style={{ marginTop: 10 }}>
                  К последнему ходу
                </button>
              </div>
            </div>

            <div className="card small" style={{ marginBottom: 20 }}>
              <h3>Область</h3>
              <p>X: {offsetX} ... {offsetX + visibleCols - 1}</p>
              <p>Y: {offsetY} ... {offsetY + visibleRows - 1}</p>
              <p>Лимит координат: ±{maxCoord}</p>
            </div>

            <div
              className="board-wrap"
              ref={boardWrapRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              style={{ cursor: "grab" }}
            >
              <div
                className="board-grid"
                style={{
                  gridTemplateColumns: `repeat(${visibleCols}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${visibleRows}, ${cellSize}px)`,
                }}
              >
                {visibleCells.map(renderCell)}
              </div>
            </div>

            <div className="actions">
              <button onClick={handleRestart}>Начать заново</button>
            </div>

            {gameState?.ranking?.length > 0 && (
              <div className="card ranking">
                <h3>Рейтинг</h3>
                <ul>
                  {gameState.ranking.map((item, index) => (
                    <li key={index}>
                      {item.place ? `${item.place} место` : "—"}: {item.name}{" "}
                      <span
                        style={{
                          color: SYMBOL_COLORS[item.symbol] || "#ffffff",
                          fontWeight: 800,
                        }}
                      >
                        ({item.symbol})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

