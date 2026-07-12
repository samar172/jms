import { Router } from "express";
import goldRates from "./goldRates.routes";
import karats from "./karats.routes";
import stoneTypes from "./stoneTypes.routes";
import categories from "./categories.routes";
import processStages from "./processStages.routes";
import karigars from "./karigars.routes";
import customersVendorsCharges from "./customersVendorsCharges.routes";

const router = Router();

router.use("/gold-rates", goldRates);
router.use("/karats", karats);
router.use("/stone-types", stoneTypes);
router.use("/categories", categories);
router.use("/process-stages", processStages);
router.use("/karigars", karigars);
router.use("/", customersVendorsCharges);

export default router;
