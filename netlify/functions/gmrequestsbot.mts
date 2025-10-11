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
  let txt: string = (msg.text || "")
    .replaceAll("@GmRequestsBot", "")
    .slice(0, 50);

  const sql = neon();

  const botCall = async (endpoint: string, body: any) => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_GM_BOT_TOKEN}/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        console.error(
          "ERROR Response from Telegram API",
          endpoint,
          res.status,
          res.statusText,
          await res.text()
        );
      }
      return res;
    } catch (err) {
      console.error("ERROR Calling Telegram API", endpoint, err);
    }
  };

  const react = async (emoji: string) => {
    // https://core.telegram.org/bots/api#setmessagereaction
    if (emoji !== "👀") {
      await react("👀");
    }
    return await botCall("setMessageReaction", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reaction: [
        {
          type: "emoji",
          emoji, // https://core.telegram.org/bots/api#reactiontypeemoji
        },
      ],
    });
  };

  const reply = async (text: string) => {
    // https://core.telegram.org/bots/api#sendmessage
    return await botCall("sendMessage", {
      chat_id: msg.chat.id,
      text,
      parse_mode: "MarkdownV2",
      reply_parameters: {
        message_id: msg.message_id,
      },
    });
  };

  const escapeText = (text: string) => {
    return text.replace(new RegExp("([_*[\\]()~`>#+-=|{}.!])", "g"), "\\$1");
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
        await react("👌");
      } catch (err) {
        console.error(
          "ERROR UPDATING REQUEST",
          msg.message_id,
          username,
          txt,
          err
        );
        await react("👻");
        return response;
      }
    } else {
      try {
        await sql`INSERT INTO gm_requests (id, username, request) VALUES (${msg.message_id}, ${username}, ${txt})`;
        console.log("INSERTED REQUEST", msg.message_id, username, txt);
        await react("👍");
      } catch (err) {
        console.error(
          "ERROR INSERTING REQUEST",
          msg.message_id,
          username,
          txt,
          err
        );
        await react("👻");
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
          await react("👻");
          return response;
        }
        await react("🔥");
      } else {
        await react("🖕");
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
      await react("🖕");
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
      await react("👻");
      return response;
    }
    await react("🔥");
  } else if (txt.startsWith("/gmlist")) {
    let rows: { [key: string]: any }[] = [];
    try {
      rows = await sql`SELECT * FROM gm_requests ORDER BY id ASC LIMIT 50`;
    } catch (err) {
      console.error("ERROR GETTING REQUESTS", username);
      await react("👻");
      return response;
    }
    if (!rows.length) {
      await react("🤷‍♂");
    } else {
      await reply(
        rows
          .map((r) => `· \`${r.id} @${r.username}\`: ${escapeText(r.request)}`)
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
