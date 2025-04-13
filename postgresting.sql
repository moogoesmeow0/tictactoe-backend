CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "passhash" TEXT DEFAULT '',
);

CREATE TABLE IF NOT EXISTS "boards" (
    "id" SERIAL PRIMARY KEY NOT NULL,
    "board" CHAR[3][3] NOT NULL,
    "date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "creatorID" INTEGER DEFAULT 0,
    CONSTRAINT "boards_creatorid_foreign" FOREIGN KEY("creatorID") REFERENCES "users"("id")
);
