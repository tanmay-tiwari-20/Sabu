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

// Initialize the client
client.initialize();

// Serve the QR code image via an HTTP server (Express)
app.get('/qr', (req, res) => {
  // Check if the QR code has been generated
  if (fs.existsSync(qrFilePath)) {
    res.sendFile(qrFilePath, (err) => {
      if (err) {
        console.error("Error serving QR code:", err);
        res.status(500).send("Error while serving QR code.");
      }
    });
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
      console.log("📲 Scan the QR code by visiting your domain URL");

      // Start the server after QR code is generated
      const port = process.env.PORT || 3000;  // Use the port provided by Railway
      const host = "0.0.0.0"; // Bind to all network interfaces to allow access externally

      app.listen(port, host, () => {
        console.log(`Server is running at https://sabu-production.up.railway.app`);
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

// Log any authentication failure
client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failed:", msg);
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

    console.log("Received message:", message.body);  // Debugging log for the message content

    if (anyLinkPattern.test(message.body)) {
      console.log("Link found in message:", message.body);  // Log the link detected

      if (isSenderAdmin) {
        console.log(`✅ Admin ${senderContact.number} posted a link.`);
        return;
      } else {
        if (linkedInLinkPattern.test(message.body)) {
          console.log(`✅ Member ${senderContact.number} posted LinkedIn link.`);
          return;
        } else {
          try {
            console.log("Deleting unauthorized message...");  // Debugging log
            await message.delete(true);

            // Update warning count
            warningCounts[senderId] = (warningCounts[senderId] || 0) + 1;
            const warnings = warningCounts[senderId];

            if (warnings >= 3) {
              // Remove member after 3 warnings
              console.log(`🚫 Removing ${senderContact.number} after 3 warnings.`);
              await chat.removeParticipants([senderId]);
              await chat.sendMessage(
                `🚫 @${senderContact.number} has been removed after 3 warnings for posting unauthorized links.`,
                { mentions: [senderContact] }
              );
              console.log(`🚫 Removed ${senderContact.number} after 3 warnings.`);
            } else {
              // Warn member with warning count
              console.log(`⚠️ Warning ${warnings}/3 given to ${senderContact.number}`);
              await chat.sendMessage(
                `⚠️ @${senderContact.number} Only LinkedIn links are allowed.\nWarning ${warnings}/3.`,
                { mentions: [senderContact] }
              );
            }
          } catch (err) {
            console.error("❌ Could not delete/warn/remove:", err);
          }
        }
      }
    }
  }
});

// Optional: Log when client is disconnected (useful for debugging)
client.on("disconnected", (reason) => {
  console.log("❌ WhatsApp client disconnected:", reason);
});
