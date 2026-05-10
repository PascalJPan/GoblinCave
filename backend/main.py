from dotenv import load_dotenv
load_dotenv()

import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import init_db
from routes.auth import router as auth_router
from routes.categories import router as categories_router
from routes.chores import router as chores_router
from routes.config import router as config_router
from routes.instances import router as instances_router
from routes.history import router as history_router
from routes.dashboard import router as dashboard_router

_log_path = os.path.join(os.path.dirname(__file__), 'errors.log')
logging.basicConfig(
    filename=_log_path,
    level=logging.ERROR,
    format='%(asctime)s %(levelname)s %(message)s',
)

app = FastAPI(title="GoblinCave API", root_path="/personal/GoblinCave/api")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.error("%s %s: %s", request.method, request.url, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(chores_router)
app.include_router(config_router)
app.include_router(instances_router)
app.include_router(history_router)
app.include_router(dashboard_router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/healthz")
def healthz():
    return {"ok": True}
