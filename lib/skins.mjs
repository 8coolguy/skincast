import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function fetchSkin(
  username,
  { cacheDir, fetcher = fetch, refresh = false } = {},
) {
  if (!/^[a-z\d_]{1,16}$/i.test(username))
    throw new Error("Invalid Minecraft username.");
  const cachedFile =
    cacheDir && path.join(cacheDir, `${username.toLowerCase()}.png`);
  if (cachedFile && !refresh) {
    const cached = await readFile(cachedFile).catch(() => null);
    if (cached) return cached;
  }
  if (username.toLowerCase() === "8coolguy" && !refresh)
    return readFile(new URL("../assets/8coolguy.png", import.meta.url));
  const request = async (url) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok)
      throw new Error(
        response.status === 404 || response.status === 204
          ? "Minecraft username not found. Upload a skin PNG if you use Bedrock."
          : "Minecraft skin service is unavailable. Try a PNG upload.",
      );
    return response;
  };
  const profile = await (
    await request(`https://api.mojang.com/users/profiles/minecraft/${username}`)
  ).json();
  if (!/^[a-f\d]{32}$/i.test(profile.id))
    throw new Error("Minecraft username not found.");
  const session = await (
    await request(
      `https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`,
    )
  ).json();
  const property = session.properties?.find((item) => item.name === "textures");
  if (!property)
    throw new Error("This profile has no skin. Upload a skin PNG.");
  const texture = JSON.parse(Buffer.from(property.value, "base64").toString())
    .textures?.SKIN?.url;
  const url = new URL(texture);
  if (
    url.hostname !== "textures.minecraft.net" ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error("Invalid Minecraft skin response.");
  url.protocol = "https:";
  const png = Buffer.from(await (await request(url)).arrayBuffer());
  if (
    png.length > 1_500_000 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Invalid skin image.");
  if (cachedFile) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachedFile, png);
  }
  return png;
}
