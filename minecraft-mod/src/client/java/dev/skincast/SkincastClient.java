package dev.skincast;

import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.file.Files;
import java.time.Duration;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SkincastClient implements ClientModInitializer {
    private static final Logger LOG = LoggerFactory.getLogger("skincast");
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final AtomicBoolean connecting = new AtomicBoolean();
    private volatile WebSocket socket;
    private volatile long retryAt;
    private volatile boolean stopped;
    private CompletableFuture<?> pendingSend = CompletableFuture.completedFuture(null);
    private URI endpoint;
    private String token;
    private double takeoffY;
    private boolean wasActive;

    @Override
    public void onInitializeClient() {
        var file = FabricLoader.getInstance().getConfigDir().resolve("skincast.properties");
        if (!Files.isRegularFile(file)) {
            LOG.info("Skincast bridge disabled. Download skincast.properties from the studio and put it in the instance config folder, then restart Minecraft.");
            return;
        }
        try (Reader reader = Files.newBufferedReader(file)) {
            var config = new Properties();
            config.load(reader);
            endpoint = URI.create(config.getProperty("url", ""));
            token = config.getProperty("token", "");
            if (!"ws".equals(endpoint.getScheme()) ||
                    !"127.0.0.1".equals(endpoint.getHost()) ||
                    !"/minecraft".equals(endpoint.getPath()) ||
                    endpoint.getPort() < 1 || endpoint.getPort() > 65535 ||
                    endpoint.getRawQuery() != null || endpoint.getUserInfo() != null || endpoint.getFragment() != null ||
                    !token.matches("[a-f0-9]{64}")) {
                throw new IllegalArgumentException("Expected a loopback Skincast URL and pairing token");
            }
        } catch (Exception error) {
            LOG.warn("Skincast bridge disabled: invalid skincast.properties. Download a fresh config from the studio.");
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            stopped = true;
            var current = socket;
            if (current != null) current.abort();
            http.close();
        });
    }

    private void tick(Minecraft client) {
        var current = socket;
        if (current == null) {
            if (!stopped && System.nanoTime() >= retryAt && connecting.compareAndSet(false, true)) connect();
            return;
        }
        if (!pendingSend.isDone()) return;
        var packet = new JsonObject();
        packet.addProperty("type", "motion");
        packet.addProperty("version", 1);
        var player = client.player;
        boolean active = player != null && client.level != null && !client.isPaused() &&
                client.screen == null && client.isWindowActive() && !player.isSpectator() && player.isAlive();
        packet.addProperty("active", active);
        if (active) {
            boolean grounded = player.onGround();
            if (!wasActive || grounded) takeoffY = player.getY();
            packet.addProperty("yaw", Mth.wrapDegrees(player.getYRot()));
            packet.addProperty("bodyYaw", Mth.wrapDegrees(player.yBodyRot));
            packet.addProperty("pitch", Mth.clamp(player.getXRot(), -90, 90));
            packet.addProperty("speed", Math.min(4, player.getDeltaMovement().horizontalDistance()));
            packet.addProperty("rise", grounded ? 0 : Mth.clamp(player.getY() - takeoffY, 0, 2));
            packet.addProperty("swing", Mth.clamp(player.getAttackAnim(1), 0, 1));
            packet.addProperty("grounded", grounded);
            packet.addProperty("crouching", player.isCrouching());
            packet.addProperty("sprinting", player.isSprinting());
            packet.addProperty("usingItem", player.isUsingItem());
        }
        wasActive = active;
        pendingSend = current.sendText(packet.toString(), true).orTimeout(1500, TimeUnit.MILLISECONDS)
                .whenComplete((ignored, error) -> { if (error != null) disconnected(current); });
    }

    private void connect() {
        retryAt = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(2))
                .header("X-Skincast-Token", token)
                .buildAsync(endpoint, new WebSocket.Listener() {
                    @Override
                    public void onOpen(WebSocket webSocket) {
                        if (stopped) { webSocket.abort(); return; }
                        socket = webSocket;
                        LOG.info("Skincast connected to the local studio.");
                        webSocket.request(1);
                    }
                    @Override
                    public java.util.concurrent.CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                        ws.request(1);
                        return null;
                    }
                    @Override
                    public java.util.concurrent.CompletionStage<?> onClose(WebSocket ws, int status, String reason) {
                        disconnected(ws);
                        return null;
                    }
                    @Override
                    public void onError(WebSocket ws, Throwable error) { disconnected(ws); }
                }).whenComplete((ws, error) -> {
                    connecting.set(false);
                    if (error != null) LOG.debug("Skincast unavailable. Retrying in five seconds.");
                });
    }

    private void disconnected(WebSocket ws) {
        if (socket == ws) {
            socket = null;
            retryAt = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            LOG.info("Skincast disconnected. Retrying the local studio in five seconds.");
        }
        ws.abort();
    }
}
