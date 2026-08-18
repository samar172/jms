import { Router } from "express";
import metalRates from "./metalRates.routes";
import karats from "./karats.routes";
import stoneTypes from "./stoneTypes.routes";
import categories from "./categories.routes";
import processStages from "./processStages.routes";
import karigars from "./karigars.routes";

const router = Router();

router.use("/metal-rates", metalRates);
router.use("/karats", karats);
router.use("/stone-types", stoneTypes);
router.use("/categories", categories);
router.use("/process-stages", processStages);
router.use("/karigars", karigars);

export default router;
