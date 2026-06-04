import json
import random
import subprocess
import time
from copy import deepcopy
from pathlib import Path

import fal
import requests
from fal.container import ContainerImage
from fal.toolkit import File, Image, download_model_weights
from fastapi import Request
from pydantic import BaseModel, Field

WORKFLOW_PATH = Path(__file__).parent / "workflow.json"
WORKFLOW_URL = File.from_path(str(WORKFLOW_PATH), repository="cdn").url

# Preferred node IDs for the bundled workflow. The setters below also fall back
# to any node exposing the requested input so exported workflows can drift safely.
POSITIVE_PROMPT_NODE = "1"
NEGATIVE_PROMPT_NODE = "1"
LATENT_NODE = "1"
SAMPLER_NODE = "1"
STEPS_NODE = "1"

MODELS = {
    # Comfy path: download URL
    "checkpoints/sd_xl_turbo_1.0_fp16.safetensors":
        "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors",
}

DOCKERFILE = f"""
FROM falai/base:3.11-12.1.0

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \\
    git wget libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/comfyanonymous/ComfyUI /app/ComfyUI
WORKDIR /app/ComfyUI
RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir -p models/checkpoints models/loras

ADD {WORKFLOW_URL} /app/workflow.json
RUN pip install --no-cache-dir boto3==1.35.74 protobuf==4.25.1 pydantic==2.10.6
"""


class LoraInput(BaseModel):
    path: str
    scale: float = 1.0


class GenerateInput(BaseModel):
    prompt: str
    negative_prompt: str = "text, watermark, blurry, low quality"
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    num_images: int = Field(default=1, ge=1, le=4)
    num_inference_steps: int = Field(default=28, ge=1, le=80)
    guidance_scale: float = Field(default=3.5, ge=0, le=20)
    output_format: str = "jpeg"
    seed: int = Field(default_factory=lambda: random.randint(0, 2**31 - 1))
    loras: list[LoraInput] = Field(default_factory=list)


class GenerateOutput(BaseModel):
    images: list[Image]
    seed: int


class StyleForgeComfy(fal.App, keep_alive=300, max_concurrency=1):
    machine_type = "GPU-A100"
    image = ContainerImage.from_dockerfile_str(DOCKERFILE)

    COMFY_HOST = "127.0.0.1"
    COMFY_PORT = 8188
    COMFY_DIR = Path("/app/ComfyUI")

    def setup(self):
        self._download_models()
        self._link_models()
        self.process = subprocess.Popen(
            ["python", "main.py", "--listen", self.COMFY_HOST, "--port", str(self.COMFY_PORT)],
            cwd=str(self.COMFY_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        self._wait_for_server(timeout=180)

        with open("/app/workflow.json", encoding="utf-8") as file:
            self.workflow_template = json.load(file)

    def _download_models(self):
        self.downloaded_paths = {
            model_path: download_model_weights(url)
            for model_path, url in MODELS.items()
        }

    def _link_models(self):
        for model_path, downloaded_path in self.downloaded_paths.items():
            comfy_path = self.COMFY_DIR / "models" / model_path
            comfy_path.parent.mkdir(parents=True, exist_ok=True)
            if comfy_path.exists() or comfy_path.is_symlink():
                comfy_path.unlink()
            comfy_path.symlink_to(downloaded_path)

    def _wait_for_server(self, timeout: int):
        start = time.time()
        while time.time() - start < timeout:
            try:
                response = requests.get(
                    f"http://{self.COMFY_HOST}:{self.COMFY_PORT}/system_stats",
                    timeout=5,
                )
                if response.status_code == 200:
                    return
            except requests.ConnectionError:
                pass
            time.sleep(1)
        raise TimeoutError("ComfyUI server did not start")

    def _build_workflow(self, input: GenerateInput):
        workflow = deepcopy(self.workflow_template)
        self._set_mapped_input(workflow, POSITIVE_PROMPT_NODE, "text", input.prompt)
        self._set_mapped_input(workflow, POSITIVE_PROMPT_NODE, "prompt", input.prompt)
        self._set_mapped_input(workflow, NEGATIVE_PROMPT_NODE, "negative_prompt", input.negative_prompt)
        self._set_mapped_input(workflow, LATENT_NODE, "width", input.width)
        self._set_mapped_input(workflow, LATENT_NODE, "height", input.height)
        self._set_mapped_input(workflow, LATENT_NODE, "batch_size", input.num_images)
        self._set_mapped_input(workflow, LATENT_NODE, "num_images", input.num_images)
        self._set_mapped_input(workflow, SAMPLER_NODE, "noise_seed", input.seed)
        self._set_mapped_input(workflow, SAMPLER_NODE, "seed", input.seed)
        self._set_mapped_input(workflow, SAMPLER_NODE, "cfg", input.guidance_scale)
        self._set_mapped_input(workflow, SAMPLER_NODE, "guidance_scale", input.guidance_scale)
        self._set_mapped_input(workflow, STEPS_NODE, "steps", input.num_inference_steps)
        self._set_mapped_input(workflow, STEPS_NODE, "num_inference_steps", input.num_inference_steps)

        first_lora = input.loras[0] if len(input.loras) > 0 else None
        second_lora = input.loras[1] if len(input.loras) > 1 else None
        self._set_mapped_input(workflow, STEPS_NODE, "lora_path_1", first_lora.path if first_lora else "")
        self._set_mapped_input(workflow, STEPS_NODE, "lora_scale_1", first_lora.scale if first_lora else 1)
        self._set_mapped_input(workflow, STEPS_NODE, "lora_path_2", second_lora.path if second_lora else "")
        self._set_mapped_input(workflow, STEPS_NODE, "lora_scale_2", second_lora.scale if second_lora else 1)
        return workflow

    def _set_node_input(self, workflow: dict, node_id: str, key: str, value):
        inputs = workflow.get(node_id, {}).get("inputs")
        if not inputs or key not in inputs:
            return False
        inputs[key] = value
        return True

    def _set_mapped_input(self, workflow: dict, node_id: str, key: str, value):
        if self._set_node_input(workflow, node_id, key, value):
            return

        for node in workflow.values():
            inputs = node.get("inputs")
            if inputs and key in inputs:
                inputs[key] = value

    def _queue_prompt(self, workflow: dict):
        response = requests.post(
            f"http://{self.COMFY_HOST}:{self.COMFY_PORT}/prompt",
            json={"prompt": workflow},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["prompt_id"]

    def _poll_for_completion(self, prompt_id: str, timeout: int = 240):
        start = time.time()
        while time.time() - start < timeout:
            response = requests.get(
                f"http://{self.COMFY_HOST}:{self.COMFY_PORT}/history/{prompt_id}",
                timeout=30,
            )
            response.raise_for_status()
            history = response.json()
            if prompt_id in history and history[prompt_id].get("status", {}).get("completed"):
                return history[prompt_id]
            time.sleep(0.5)
        raise TimeoutError("ComfyUI generation did not complete")

    def _output_paths(self, history: dict):
        paths = []
        for output in history.get("outputs", {}).values():
            for image in output.get("images", []):
                filename = image.get("filename")
                subfolder = image.get("subfolder", "")
                if filename:
                    paths.append(self.COMFY_DIR / "output" / subfolder / filename)
        return paths

    @fal.endpoint("/generate")
    def generate(self, input: GenerateInput, request: Request) -> GenerateOutput:
        workflow = self._build_workflow(input)
        prompt_id = self._queue_prompt(workflow)
        history = self._poll_for_completion(prompt_id)
        paths = self._output_paths(history)

        if not paths:
            raise RuntimeError("No image output found in ComfyUI history")

        return GenerateOutput(
            images=[Image.from_path(str(path), request=request) for path in paths],
            seed=input.seed,
        )
