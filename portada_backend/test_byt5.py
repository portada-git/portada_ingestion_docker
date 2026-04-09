"""
Script de prueba para el modelo ByT5 de similitud semántica.
Verifica que el modelo se carga correctamente y genera scores esperados.
"""

from app.services.byt5_encoder import ByT5Encoder, get_byt5_similarity


def test_basic_similarity():
    """Prueba casos básicos de similitud."""
    print("="*60)
    print("Test 1: Similitud básica")
    print("="*60)
    
    test_cases = [
        ("española", "ospanola", 0.74),  # Esperado: ~0.7472
        ("inglesa", "lngles", 0.75),     # Esperado: ~0.7583
        ("francesa", "trancesa", 0.75),  # Esperado: ~0.7523
        ("cubana", "Cuba", 0.76),        # Esperado: ~0.7676
        ("uruguaya", "uruguay", 0.97),   # Esperado: ~0.9735
    ]
    
    for text1, text2, expected_min in test_cases:
        score = get_byt5_similarity(text1, text2)
        status = "✓" if score >= expected_min else "✗"
        print(f"{status} {text1:15} <-> {text2:15} = {score:.4f} (esperado >= {expected_min})")


def test_batch_processing():
    """Prueba procesamiento en batch."""
    print("\n" + "="*60)
    print("Test 2: Procesamiento en batch")
    print("="*60)
    
    encoder = ByT5Encoder.get_instance()
    
    query = "española"
    candidates = ["ospanola", "spanol", "espanoli", "esp", "spanish", "Spain"]
    
    print(f"\nQuery: '{query}'")
    print(f"Candidatos: {len(candidates)}")
    
    best_match, best_score = encoder.find_best_match(query, candidates, threshold=0.5)
    
    print(f"\nMejor match: '{best_match}' con score {best_score:.4f}")
    
    # Mostrar todos los scores
    print("\nTodos los scores:")
    for candidate in candidates:
        score = encoder.cosine_similarity(query, candidate)
        print(f"  {candidate:15} = {score:.4f}")


def test_ocr_variants():
    """Prueba variantes OCR comunes."""
    print("\n" + "="*60)
    print("Test 3: Variantes OCR")
    print("="*60)
    
    ocr_tests = [
        ("inglesa", ["1ng1es", "injlesa", "ings"]),
        ("francesa", ["frances", "franc"]),
        ("uruguaya", ["oriental", "ur", "ori0ntal", "Or1ent4l"]),
    ]
    
    encoder = ByT5Encoder.get_instance()
    
    for canonical, variants in ocr_tests:
        print(f"\nCanónico: '{canonical}'")
        for variant in variants:
            score = encoder.cosine_similarity(canonical, variant)
            print(f"  {variant:15} = {score:.4f}")


if __name__ == "__main__":
    print("\n🚀 Iniciando pruebas del modelo ByT5...\n")
    
    try:
        test_basic_similarity()
        test_batch_processing()
        test_ocr_variants()
        
        print("\n" + "="*60)
        print("✓ Todas las pruebas completadas")
        print("="*60)
        
    except Exception as e:
        print(f"\n✗ Error durante las pruebas: {e}")
        import traceback
        traceback.print_exc()
