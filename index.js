const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// Start client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});
client.initialize();

const warningCounts = {}; // { userId: warningCount }

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Scan the QR code above to connect!");
});

// Bot ready
client.on("ready", () => {
  console.log("✅ Sabu is running!");
});

// Handle group messages
client.on("message", async (message) => {
  const chat = await message.getChat();

  if (chat.isGroup) {
    const groupLinkPattern = /https:\/\/chat\.whatsapp\.com\/\S+/;
    const linkedInLinkPattern = /https:\/\/(www\.)?linkedin\.com\/\S+/;
    const anyLinkPattern = /(https?:\/\/[^\s]+)/g;

    const senderId = message.author || message.from;
    const senderContact = await client.getContactById(senderId);

    const sender = chat.participants.find(
      (p) => p.id._serialized === senderId
    );
    const isSenderAdmin = sender?.isAdmin || false;

    if (anyLinkPattern.test(message.body)) {
      if (isSenderAdmin) {
        console.log(`✅ Admin ${senderContact.number} posted a link.`);
        return;
      } else {
        if (linkedInLinkPattern.test(message.body)) {
          console.log(`✅ Member ${senderContact.number} posted LinkedIn link.`);
          return;
        } else {
          try {
            await message.delete(true);

            // Update warning count
            warningCounts[senderId] = (warningCounts[senderId] || 0) + 1;
            const warnings = warningCounts[senderId];

            if (warnings >= 3) {
              // Remove member
              await chat.removeParticipants([senderId]);
              await chat.sendMessage(
                `🚫 @${senderContact.number} has been removed after 3 warnings for posting unauthorized links.`,
                { mentions: [senderContact] }
              );
              console.log(`🚫 Removed ${senderContact.number} after 3 warnings.`);
            } else {
              // Warn member with warning count
              await chat.sendMessage(
                `⚠️ @${senderContact.number} Only LinkedIn links are allowed.\nWarning ${warnings}/3.`,
                { mentions: [senderContact] }
              );
              console.log(`⚠️ Warning ${warnings}/3 given to ${senderContact.number}`);
            }
          } catch (err) {
            console.error("❌ Could not delete/warn/remove:", err);
          }
        }
      }
    }
  }
});
