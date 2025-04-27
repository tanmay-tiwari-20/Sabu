const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();

// Path to store the QR code image
const qrFilePath = path.join(__dirname, "qr.png");

// Flag to track QR code generation status
let isQrGenerated = false;

// Store warnings count for users
const warningCounts = {}; // { userId: warningCount }

// Start client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.initialize();

// Serve the QR code image via an HTTP server (Express)
app.get('/qr', (req, res) => {
  // Check if the QR code has been generated
  if (isQrGenerated) {
    res.sendFile(qrFilePath);
  } else {
    res.status(404).send("QR code not generated yet, please wait.");
  }
});

// Serve a home route with a message
app.get('/', (req, res) => {
  res.send('<h1>Welcome to the WhatsApp Bot</h1><p>Scan the QR code: <a href="/qr">Click Here</a></p>');
});

// Generate and save QR code as an image file
client.on("qr", (qr) => {
  // Check if the QR code already exists to prevent regeneration
  if (!fs.existsSync(qrFilePath)) {
    // Generate QR code and save it to a file
    qrcode.toFile(qrFilePath, qr, (err) => {
      if (err) {
        console.error("Failed to generate QR code", err);
        return;
      }
      console.log("QR code saved to", qrFilePath);
      isQrGenerated = true;  // Set the flag to true once QR code is generated
      console.log("📲 Scan the QR code by visiting the domain URL");

      // Start the server after QR code is generated
      const port = process.env.PORT || 3000;  // Use the port provided by Railway
      app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
      });
    });
  } else {
    console.log("QR code already generated, skipping regeneration.");
  }
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
