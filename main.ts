import { Application, Router } from "@oak/oak";
import { Client } from "@db/postgres";

const client = new Client({
  user: "root",
  database: "tictactoe",
  hostname: "taranathan.com",
  password: "M00g03sm30w!",
  port: 5432,
});
await client.connect();

const app = new Application();
const router = new Router();

const activeConnections = new Set<WebSocket>();
const boardConnections = new Map<number, Set<WebSocket>>();

//========================= cors stuff =========================

app.use(async (ctx, next) => {
  ctx.response.headers.set(
    "Access-Control-Allow-Origin",
    "*",
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );


  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
  } else {
    await next();
  }
});

//========================= tictactoe stuff =========================

router.get("/boards/:board", async (ctx, next) => {
  ctx.response.body = await get_board(parseInt(ctx.params.board));
  ctx.response.status = 200;
});

router.get("/boards", async (ctx, next) => {
  ctx.response.body = await client.queryObject("SELECT * FROM boards;");
  ctx.response.status = 200;
});

router.get("/users", async (ctx, next) => {
  ctx.response.body = await client.queryObject("SELECT * FROM users;");
  ctx.response.status = 200;
});

router.get("/users/:user", async (ctx, next) => {
  ctx.response.body = await get_user(parseInt(ctx.params.user));
  ctx.response.status = 200;
});

async function get_board(index: number) {
  return client.queryObject(`SELECT * FROM boards WHERE id = $1;`, [index]);
}

async function get_user(index: number) {
  return client.queryObject(`SELECT * FROM users WHERE id = $1;`, [index]);
}

router.delete("/users/:user", async (ctx, next) => {
  await client.queryObject(`DELETE FROM users WHERE id = $1;`, [
    ctx.params.user,
  ]);
  ctx.response.status = 204; // No Content
});

router.delete("/boards/:board", async (ctx, next) => {
  await client.queryObject(`DELETE FROM boards WHERE id = $1;`, [
    ctx.params.board,
  ]);
  ctx.response.status = 204; // No Content
});

router.put("/users/:user", async (ctx, next) => {
  const { username, passhash } = await ctx.request.body.json();
  await client.queryObject(
    `UPDATE users SET username = $1, passhash = $2 WHERE id = $3;`,
    [username, passhash, ctx.params.user],
  );
  ctx.response.status = 200;
});

router.put("/boards/:board", async (ctx, next) => {
  const boardId = parseInt(ctx.params.board);
  const { board, date, creatorID } = await ctx.request.body.json();
  await client.queryObject(
    `UPDATE boards SET board = $1, date = $2, "creatorID" = $3 WHERE id = $4;`,
    [board, date, creatorID, boardId],
  );

  // Send update notification to all clients connected to this board
  const updatedBoard = await get_board(boardId);
  broadcastToBoard(boardId, {
    type: "board_updated",
    boardId,
    data: updatedBoard.rows,
  });

  ctx.response.status = 200;
});

router.post("/boards", async (ctx, next) => {
  const requestBody = await ctx.request.body.json();
  const { board, creatorID } = requestBody;

  await client.queryObject(
    `INSERT INTO boards (board, "creatorID") VALUES ($1, $2);`,
    [board, creatorID],
  );
  ctx.response.status = 201;
});

router.post("/users", async (ctx, next) => {
  const { username, passhash } = await ctx.request.body.json();
  const result = await client.queryObject(
    `INSERT INTO users (username, passhash) VALUES ($1, $2)`,
    [username, passhash],
  );
  ctx.response.body = result;
  ctx.response.status = 200;
});

//========================= websocket stuff =========================

router.get("/ws/board/:board", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 400;
    ctx.response.body = "Cannot upgrade to WebSocket";
    console.log("Cannot upgrade to WebSocket");
    return;
  }

  console.log("WebSocket connection requested");

  const boardId = parseInt(ctx.params.board);
  const ws: WebSocket = await ctx.upgrade();
  activeConnections.add(ws);

  // Add the connection to the board-specific collection
  if (!boardConnections.has(boardId)) {
    boardConnections.set(boardId, new Set<WebSocket>());
  }
  boardConnections.get(boardId)?.add(ws);

  ws.onopen = () => {
    console.log(`WebSocket connection opened for board ${boardId}`);
  };

  ws.onclose = () => {
    console.log(`WebSocket connection closed for board ${boardId}`);
    activeConnections.delete(ws);

    // Remove from board connections
    boardConnections.get(boardId)?.delete(ws);
    if (boardConnections.get(boardId)?.size === 0) {
      boardConnections.delete(boardId);
    }
  };

  ws.onerror = (error) => {
    console.error(`WebSocket error for board ${boardId}:`, error);
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "get_board": {
          const board = await get_board(boardId);
          ws.send(JSON.stringify({ type: "board_data", data: board.rows }));
          break;
        }

        case "get_boards": {
          const boards = await client.queryObject("SELECT * FROM boards;");
          ws.send(JSON.stringify({ type: "boards_data", data: boards.rows }));
          break;
        }

        case "get_user": {
          const user = await get_user(message.userId);
          ws.send(JSON.stringify({ type: "user_data", data: user.rows }));
          break;
        }

        case "get_users": {
          const users = await client.queryObject("SELECT * FROM users;");
          ws.send(JSON.stringify({ type: "users_data", data: users.rows }));
          break;
        }

        case "delete_user": {
          await client.queryObject(`DELETE FROM users WHERE id = $1;`, [
            message.userId,
          ]);
          ws.send(
            JSON.stringify({ type: "user_deleted", userId: message.userId }),
          );
          break;
        }

        case "delete_board": {
          if (message.boardId === boardId) {
            await client.queryObject(`DELETE FROM boards WHERE id = $1;`, [
              boardId,
            ]);
            ws.send(
              JSON.stringify({ type: "board_deleted", boardId: boardId }),
            );
          }
          break;
        }

        case "update_user": {
          const { userId, username, passhash } = message;
          await client.queryObject(
            `UPDATE users SET username = $1, passhash = $2 WHERE id = $3;`,
            [username, passhash, userId],
          );
          ws.send(JSON.stringify({ type: "user_updated", userId }));
          break;
        }

        case "update_board": {
          if (message.boardId === boardId) {
            const { board, date, creatorID } = message;
            await client.queryObject(
              `UPDATE boards SET board = $1, date = $2, "creatorID" = $3 WHERE id = $4;`,
              [board, date, creatorID, boardId],
            );

            // Notify all clients connected to this board
            const updatedBoard = await get_board(boardId);
            broadcastToBoard(boardId, {
              type: "board_updated",
              boardId,
              data: updatedBoard.rows,
            });
          }
          break;
        }

        case "create_user": {
          const { username, passhash } = message;
          const result = await client.queryObject(
            `INSERT INTO users (username, passhash) VALUES ($1, $2) RETURNING id;`,
            [username, passhash],
          );
          ws.send(
            JSON.stringify({
              type: "user_created",
              userId: (result.rows as { id: number }[])[0].id,
            }),
          );
          break;
        }

        case "create_board": {
          const { board, creatorID } = message;
          const result = await client.queryObject(
            `INSERT INTO boards (board, "creatorID") VALUES ($1, $2) RETURNING id;`,
            [board, creatorID],
          );
          const newBoardId = (result.rows as { id: number }[])[0].id;
          ws.send(
            JSON.stringify({
              type: "board_created",
              boardId: newBoardId,
            }),
          );
          break;
        }
      }
    } catch (error) {
      console.error("WebSocket error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "An error occurred processing your request",
        }),
      );
    }
  };
});

// Add a function to broadcast messages to a specific board
function broadcastToBoard(boardId: number, message: any) {
  const connections = boardConnections.get(boardId);
  if (connections) {
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

//========================= final stuff =========================

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = 1423;
console.log(`Server is running on http://localhost:${PORT}`);
await app.listen({ port: PORT });
