import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeappRouter from "./timeapp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeappRouter);

export default router;
