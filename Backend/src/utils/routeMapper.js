import { logger } from "./logger.js";

export function printRoutes(app) {
  if (!app._router || !app._router.stack) return;

  const routes = [];

  const processLayer = (layer, prefix = "") => {
    if (layer.route) {
      const path = prefix + layer.route.path;
      Object.keys(layer.route.methods).forEach((method) => {
        if (layer.route.methods[method]) {
          routes.push({ method: method.toUpperCase(), path });
        }
      });
    } else if (layer.name === "router" && layer.handle.stack) {
      let routerPath = prefix;
      // Get prefix for nested routers
      const regex = layer.regexp.toString();
      if (regex !== '/^\\/?(?=\\/|$)/i') {
        const match = regex.match(/^\/\^\\\/(.*?)\\\/?\(\?\=\\\/\|\$\)\/i/);
        if (match && match[1]) {
           routerPath += "/" + match[1];
        }
      }
      layer.handle.stack.forEach((stackLayer) => {
        processLayer(stackLayer, routerPath);
      });
    }
  };

  app._router.stack.forEach((layer) => processLayer(layer));

  // Log summary instead of spamming 50+ routes
  logger.info(`Mapped ${routes.length} API endpoints`, { context: "RoutesResolver" });
}
