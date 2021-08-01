-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('IN_PROGRESS', 'DRAWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaways" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "status" "GiveawayStatus" NOT NULL DEFAULT E'IN_PROGRESS',
    "draw_at" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "winners" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "giveaway_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "giveaways.message_id_unique" ON "giveaways"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "entries.giveaway_id_user_id_unique" ON "entries"("giveaway_id", "user_id");

-- AddForeignKey
ALTER TABLE "giveaways" ADD FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;
