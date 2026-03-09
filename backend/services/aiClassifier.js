const classifyEmergency = (text) => {

  const message = text.toLowerCase();

  if (
    message.includes("accident") ||
    message.includes("crash") ||
    message.includes("collision")
  ) {
    return "Accident";
  }

  if (
    message.includes("fire") ||
    message.includes("burning") ||
    message.includes("smoke")
  ) {
    return "Fire";
  }

  if (
    message.includes("heart") ||
    message.includes("medical") ||
    message.includes("unconscious") ||
    message.includes("ambulance")
  ) {
    return "Medical";
  }

  if (
    message.includes("robbery") ||
    message.includes("crime") ||
    message.includes("attack")
  ) {
    return "Crime";
  }

  if (
    message.includes("breakdown") ||
    message.includes("car broke") ||
    message.includes("engine problem") ||
    message.includes("car stopped")
  ) {
    return "Breakdown";
  }

  return "Other";
};

module.exports = classifyEmergency;