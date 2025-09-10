import { Config, Context } from "@netlify/functions";
import { neon } from "@netlify/neon";

async function handler(request: Request, context: Context): Promise<Response> {
  const response = new Response("", { status: 200, headers: {} });

  const headerToken = request.headers.get("x-telegram-bot-api-secret-token");
  if (request.method !== "POST" || headerToken !== process.env.AUTH_KEY) {
    return response;
  }

  const allowed_users = process.env.TELEGRAM_GM_BOT_ALLOWED_USERS!.split(",");
  allowed_users.push(process.env.TELEGRAM_GM_BOT_ADMIN_USER!);

  const payload = await request.json();

  const msg = payload.message || payload.edited_message;
  const username = msg?.from?.username;
  if (!msg || !username || !allowed_users.includes(username)) {
    return response;
  }
  const isAdmin = username === process.env.TELEGRAM_GM_BOT_ADMIN_USER;
  let txt: string = (msg.text || "").slice(0, 50);

  const sql = neon();

  const reply = async (text: string) => {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_GM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text,
          parse_mode: "MarkdownV2",
          reply_parameters: {
            message_id: msg.message_id,
          },
        }),
      }
    );
  };

  if (txt.startsWith("/gmrequest")) {
    txt = txt.replaceAll("/gmrequest", "").trim();
    if (!txt) {
      return response;
    }

    if (msg.edit_date) {
      try {
        await sql`UPDATE gm_requests SET request = ${txt} WHERE id = ${msg.message_id} AND username = ${username}`;
        console.log("UPDATED REQUEST", msg.message_id, username, txt);
        await reply(`Actualizado 🙃 \\(\\=${msg.message_id}\\)`);
      } catch (err) {
        console.error(
          "ERROR UPDATING REQUEST",
          msg.message_id,
          username,
          txt,
          err
        );
        await reply(`Error ☠️`);
        return response;
      }
    } else {
      try {
        await sql`INSERT INTO gm_requests (id, username, request) VALUES (${msg.message_id}, ${username}, ${txt})`;
        console.log("INSERTED REQUEST", msg.message_id, username, txt);
        await reply(`Listo 😬 \\(\\+${msg.message_id}\\)`);
      } catch (err) {
        console.error(
          "ERROR INSERTING REQUEST",
          msg.message_id,
          username,
          txt,
          err
        );
        await reply(`Error ☠️`);
        return response;
      }
    }
  } else if (txt.startsWith("/gmforget")) {
    txt = txt.replaceAll("/gmforget", "").replaceAll("  ", " ").trim();
    if (!txt) {
      return response;
    }
    const parts = txt.split(RegExp(" +"));
    let msgId: number | null = null;
    let msgUsername: string | null = null;
    if (parts.length && parts[0] == "all") {
      if (isAdmin) {
        try {
          await sql`DELETE FROM gm_requests;`;
          console.log("DELETED ALL REQUESTS!", "BY", username);
        } catch (err) {
          console.error("ERROR DELETING REQUESTS", "BY", username, err);
          await reply(`Error ☠️`);
          return response;
        }
        await reply("Todo limpio 🧹");
      } else {
        await reply("🖕");
      }
      return response;
    }
    if (parts.length >= 1) {
      msgId = parseInt(parts[0]);
    }
    if (parts.length >= 2) {
      msgUsername = parts[1].trim();
    }
    if (!msgId || isNaN(msgId)) {
      return response;
    }
    msgUsername = (msgUsername || "").replaceAll("@", "");
    if (msgUsername && msgUsername !== username && !isAdmin) {
      await reply(`Si no es tuyo, no lo toques! 😤`);
      return response;
    }
    try {
      await sql`DELETE FROM gm_requests WHERE id = ${msgId} AND username = ${
        msgUsername || username
      }`;
      console.log("DELETED REQUEST", msgId, msgUsername, "BY", username);
    } catch (err) {
      console.error(
        "ERROR DELETING REQUEST",
        msgId,
        msgUsername,
        "BY",
        username,
        err
      );
      await reply(`Error ☠️`);
      return response;
    }
    await reply(`Eliminado 😶‍🌫 \\(\\-\`${msgId}\`\\)`);
  } else if (txt.startsWith("/gmlist")) {
    let rows: { [key: string]: any }[] = [];
    try {
      rows = await sql`SELECT * FROM gm_requests ORDER BY id ASC LIMIT 50`;
    } catch (err) {
      console.error("ERROR GETTING REQUESTS", username);
      await reply(`Error ☠️`);
      return response;
    }
    if (!rows.length) {
      await reply("No requests 🥱");
    } else {
      await reply(
        rows
          .map((r) => `\\- \\[\`${r.id}\`\\] \`@${r.username}\`: ${r.request}`)
          .join("\n")
      );
    }
  }

  return response;
}

export default async (
  request: Request,
  context: Context
): Promise<Response> => {
  return await handler(request, context);
};

export const config: Config = {
  path: "/gmrequestsbot",
  // method: "POST",
};
