import { app } from "./app";
import { env } from "./env";

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`JMS API listening on http://localhost:${env.PORT}`);
});
