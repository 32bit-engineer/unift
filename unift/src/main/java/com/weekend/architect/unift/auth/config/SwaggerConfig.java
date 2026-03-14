package com.weekend.architect.unift.auth.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    private static final String SECURITY_SCHEME_NAME = "BearerAuth";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("UniFT API")
                        .description(
                                """
                                UniFT — personal command centre for people who live on their own server.

                                **Authentication flow:**
                                1. `POST /api/auth/register` or `POST /api/auth/login` → copy the `access_token` from the response.
                                2. Click **Authorize** (🔒) at the top right, paste the token and click **Authorize**.
                                3. All protected endpoints will now include the `Authorization: Bearer <token>` header automatically.
                                """)
                        .version("v1.0")
                        .contact(new Contact().name("Weekend Architect")))
                // Apply Bearer security globally — auth endpoints override this with @SecurityRequirements({})
                .addSecurityItem(new SecurityRequirement().addList(SECURITY_SCHEME_NAME))
                .components(
                        new Components()
                                .addSecuritySchemes(
                                        SECURITY_SCHEME_NAME,
                                        new SecurityScheme()
                                                .name(SECURITY_SCHEME_NAME)
                                                .type(SecurityScheme.Type.HTTP)
                                                .scheme("bearer")
                                                .bearerFormat("JWT")
                                                .description(
                                                        "Paste the access_token received from /api/auth/login or /api/auth/register")));
    }
}
