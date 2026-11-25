import { OpenAPIHono } from "@hono/zod-openapi";
import { errorHandler, notFound, validationHook } from "./middleware/errors";
import { activity } from "./routes/activity";
import { adjustments } from "./routes/adjustments";
import { aiRouter } from "./routes/ai";
import { attendance } from "./routes/attendance";
import { checklists } from "./routes/checklists";
import { deliveries } from "./routes/deliveries";
import { health } from "./routes/health";
import { materials } from "./routes/materials";
import { progress } from "./routes/progress";
import { projects } from "./routes/projects";
import { proposals } from "./routes/proposals";
import { stock } from "./routes/stock";
import { summary } from "./routes/summary";
import { usages } from "./routes/usages";
import { wagePayments } from "./routes/wagePayments";
import { wageSheet } from "./routes/wageSheet";
import { workers } from "./routes/workers";

// Every router is mounted here already. Lanes add routes inside their own file, not here.
export const app = new OpenAPIHono({ defaultHook: validationHook }).basePath("/api/v1");

app.onError(errorHandler);
app.notFound(notFound);

app.route("/", projects);
app.route("/", materials);
app.route("/", workers);
app.route("/", deliveries);
app.route("/", usages);
app.route("/", stock);
app.route("/", health);
app.route("/", attendance);
app.route("/", wagePayments);
app.route("/", adjustments);
app.route("/", summary);
app.route("/", wageSheet);
app.route("/", progress);
app.route("/", proposals);
app.route("/", activity);
app.route("/", checklists);
app.route("/", aiRouter);

app.doc("/doc", {
  openapi: "3.0.0",
  info: { title: "Slate API", version: "0.1.0" },
});

export type App = typeof app;
