export function connect(onMessage, onConnection) {
  let socket;
  let timer;
  let stopped = false;
  const open = () => {
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/events`,
    );
    socket.addEventListener("open", () => onConnection(true));
    socket.addEventListener("message", (event) =>
      onMessage(JSON.parse(event.data)),
    );
    socket.addEventListener("close", () => {
      onConnection(false);
      if (!stopped) timer = setTimeout(open, 1200);
    });
  };
  open();
  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      return false;
    },
    dispose() {
      stopped = true;
      clearTimeout(timer);
      socket.close();
    },
  };
}

let saves = Promise.resolve();
export function saveSettings(patch) {
  const operation = saves.then(async () => {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.settings;
  });
  saves = operation.catch(() => {});
  return operation;
}
