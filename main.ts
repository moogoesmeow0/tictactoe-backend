import { Application, Router } from "@oak/oak";
import { Client } from "@db/postgres";
import { hash } from "node:crypto";

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

const allowedOrigins = ["https://taranathan.com", "https://api.taranathan.com"];

app.use(async (ctx, next) => {
  const requestOrigin = ctx.request.headers.get("Origin") ?? "";
  if (allowedOrigins.includes(requestOrigin)) {
    ctx.response.headers.set("Access-Control-Allow-Origin", requestOrigin);
  }
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
  const { board, date, creatorID } = await ctx.request.body.json();
  await client.queryObject(
    `UPDATE boards SET board = $1, date = $2, "creatorID" = $3 WHERE id = $4;`,
    [board, date, creatorID, ctx.params.board],
  );
  ctx.response.status = 200;
});

router.post("/boards", async (ctx, next) => {
  const { board, date, creatorID } = await ctx.request.body.json();
  await client.queryObject(
    `INSERT INTO boards (board, date, "creatorID") VALUES ($1, $2, $3);`,
    [board, date, creatorID],
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

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = 1423;
console.log(`Server is running on http://localhost:${PORT}`);
await app.listen({ port: PORT });
