"""
Servicio para usar el modelo ByT5 de Hugging Face para similitud semántica.
Modelo: agusnieto77/byt5-portada-contrastivo

Este modelo genera embeddings de texto que se comparan por similitud coseno.
Específicamente entrenado para variantes OCR de gentilicios y entidades históricas.
"""

import os
from typing import List, Optional

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, T5EncoderModel


class ByT5Encoder:
    """
    Wrapper para el modelo ByT5 de similitud semántica.
    Carga el modelo desde Hugging Face y genera embeddings.
    """

    MODEL_NAME = "agusnieto77/byt5-portada-contrastivo"
    _instance: Optional["ByT5Encoder"] = None

    def __init__(self, model_name: str = MODEL_NAME, device: Optional[str] = None):
        """
        Inicializa el encoder ByT5.

        Args:
            model_name: Nombre del modelo en Hugging Face
            device: Device para torch ('cpu', 'cuda', etc). Auto-detecta si es None.
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        print(f"Cargando modelo ByT5: {model_name}")
        print(f"Device: {self.device}")

        # Cargar tokenizer y modelo
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = T5EncoderModel.from_pretrained(
            model_name, torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32
        )
        self.model.to(self.device)
        self.model.eval()

        print("✓ Modelo ByT5 cargado correctamente")

    @classmethod
    def get_instance(cls, model_name: str = MODEL_NAME) -> "ByT5Encoder":
        """Singleton para reutilizar el modelo cargado."""
        if cls._instance is None or cls._instance.model_name != model_name:
            cls._instance = cls(model_name)
        return cls._instance

    def get_embedding(self, texto: str, max_length: int = 128) -> torch.Tensor:
        """
        Genera el embedding de un texto usando mean pooling.

        Args:
            texto: Texto a encodear
            max_length: Longitud máxima de tokens

        Returns:
            Tensor con el embedding (shape: [1, hidden_size])
        """
        inputs = self.tokenizer(
            texto, return_tensors="pt", truncation=True, max_length=max_length
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            out = self.model(**inputs)

        # Mean pooling con máscara de atención
        mask = inputs["attention_mask"].unsqueeze(-1).expand(out.last_hidden_state.size()).float()
        embedding = (out.last_hidden_state.float() * mask).sum(1) / mask.sum(1).clamp(min=1e-9)

        return embedding

    def get_embeddings_batch(
        self, textos: List[str], max_length: int = 128, batch_size: int = 32
    ) -> torch.Tensor:
        """
        Genera embeddings para múltiples textos en batches.

        Args:
            textos: Lista de textos
            max_length: Longitud máxima de tokens
            batch_size: Tamaño del batch

        Returns:
            Tensor con embeddings (shape: [len(textos), hidden_size])
        """
        all_embeddings = []

        for i in range(0, len(textos), batch_size):
            batch = textos[i : i + batch_size]
            inputs = self.tokenizer(
                batch,
                return_tensors="pt",
                truncation=True,
                max_length=max_length,
                padding=True,
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                out = self.model(**inputs)

            # Mean pooling
            mask = inputs["attention_mask"].unsqueeze(-1).expand(out.last_hidden_state.size()).float()
            embeddings = (out.last_hidden_state.float() * mask).sum(1) / mask.sum(1).clamp(min=1e-9)

            all_embeddings.append(embeddings)

        return torch.cat(all_embeddings, dim=0)

    def cosine_similarity(self, texto1: str, texto2: str) -> float:
        """
        Calcula similitud coseno entre dos textos.

        Args:
            texto1: Primer texto
            texto2: Segundo texto

        Returns:
            Score de similitud (0-1)
        """
        emb1 = self.get_embedding(texto1)
        emb2 = self.get_embedding(texto2)
        return F.cosine_similarity(emb1, emb2).item()

    def find_best_match(
        self, query: str, candidates: List[str], threshold: float = 0.5
    ) -> tuple[Optional[str], float]:
        """
        Encuentra el mejor match de una query contra una lista de candidatos.

        Args:
            query: Texto a buscar
            candidates: Lista de candidatos
            threshold: Umbral mínimo de similitud

        Returns:
            (mejor_candidato, score) o (None, 0.0) si no supera el threshold
        """
        if not candidates:
            return None, 0.0

        query_emb = self.get_embedding(query)
        candidate_embs = self.get_embeddings_batch(candidates)

        # Calcular similitudes
        similarities = F.cosine_similarity(query_emb, candidate_embs)
        best_idx = similarities.argmax().item()
        best_score = similarities[best_idx].item()

        if best_score >= threshold:
            return candidates[best_idx], best_score
        return None, best_score


# Función de conveniencia para uso directo
def get_byt5_similarity(texto1: str, texto2: str) -> float:
    """
    Calcula similitud entre dos textos usando el modelo ByT5.

    Args:
        texto1: Primer texto
        texto2: Segundo texto

    Returns:
        Score de similitud (0-1)
    """
    encoder = ByT5Encoder.get_instance()
    return encoder.cosine_similarity(texto1, texto2)
