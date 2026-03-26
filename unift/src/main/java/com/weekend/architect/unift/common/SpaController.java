package com.weekend.architect.unift.common;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Catch-all controller that forwards all unmatched GET requests to the React SPA entry point.
 *
 * <p>This is only meaningful when the frontend static assets are embedded in the Spring Boot JAR
 * (i.e. the single-container build). Requests to API paths are handled before this controller
 * because Spring MVC resolves more-specific path patterns first.
 *
 * <p>Without this, a hard browser refresh on a React Router path (e.g. /files, /terminal) would
 * return a 404 from Spring Boot since there is no matching static file.
 */
@Controller
public class SpaController {

    /**
     * Forward any path that was not matched by a @RestController or a static resource handler to
     * the React SPA's index.html so that the client-side router can take over.
     *
     * <p>The pattern intentionally excludes /api/**, /ws/**, /swagger-ui/**, and /v3/** which are
     * handled by their own controllers or Spring Security; those never reach this method.
     *
     * @return a forward directive recognised by Spring MVC's InternalResourceViewResolver
     */
    @SuppressWarnings("java:S6856")
    @RequestMapping(
            value = {
                "/",
                "/{path:^(?!api|ws|swagger-ui|v3|actuator).*}",
                "/{path:^(?!api|ws|swagger-ui|v3|actuator).*}/**"
            })
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
