package com.varsha.videocall.config;

import com.varsha.videocall.dto.Dtos.IceServer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the ICE server list handed to the browser in the grant response. STUN is always present;
 * TURN is added only if a TURN url is configured (prod). Credentials are server-supplied so they
 * aren't hard-coded in the SPA bundle.
 */
@Configuration
public class IceServersConfig {

    @Bean
    public List<IceServer> iceServers(
            @Value("${app.videocall.ice.stun-url:stun:stun.l.google.com:19302}") String stunUrl,
            @Value("${app.videocall.ice.turn-url:}") String turnUrl,
            @Value("${app.videocall.ice.turn-username:}") String turnUsername,
            @Value("${app.videocall.ice.turn-credential:}") String turnCredential) {

        List<IceServer> servers = new ArrayList<>();
        if (stunUrl != null && !stunUrl.isBlank()) {
            servers.add(new IceServer(List.of(stunUrl), null, null));
        }
        if (turnUrl != null && !turnUrl.isBlank()) {
            servers.add(new IceServer(
                    List.of(turnUrl),
                    turnUsername == null || turnUsername.isBlank() ? null : turnUsername,
                    turnCredential == null || turnCredential.isBlank() ? null : turnCredential));
        }
        return List.copyOf(servers);
    }
}
