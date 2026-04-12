module.exports = {
  name: "volume",
  description: "Set volume",
  execute(message, args) {
    const vol = args[0] || "50";
    message.reply("🔊 Volume set to " + vol + "% (basic version)");
  }
};