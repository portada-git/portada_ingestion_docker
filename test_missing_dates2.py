#!/usr/bin/env python3
"""
Test script para probar diferentes formatos de archivo
"""
import requests

BASE_URL = "http://localhost:8000/api/v1"

def test_yaml_format():
    """Prueba con formato YAML correcto"""
    print("\n=== Test: Missing dates con formato YAML ===")
    url = f"{BASE_URL}/queries/gaps/file"
    
    # Formato YAML correcto: fecha: [ediciones]
    file_content = """1850-01-05: [u]
1850-01-08: [u]
1850-01-13: [u]"""
    
    files = {
        'file': ('dates.yaml', file_content, 'text/plain')
    }
    params = {
        'publication': 'db'
    }
    
    try:
        response = requests.post(url, files=files, params=params)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Tipo de respuesta: {type(data)}")
            if isinstance(data, list):
                print(f"Cantidad de fechas faltantes: {len(data)}")
                print(f"Fechas: {data}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

def test_json_format():
    """Prueba con formato JSON"""
    print("\n=== Test: Missing dates con formato JSON ===")
    url = f"{BASE_URL}/queries/gaps/file"
    
    # Formato JSON: [[fecha, [ediciones]]]
    file_content = """[["1850-01-05", ["u"]], ["1850-01-08", ["u"]], ["1850-01-13", ["u"]]]"""
    
    files = {
        'file': ('dates.json', file_content, 'application/json')
    }
    params = {
        'publication': 'db'
    }
    
    try:
        response = requests.post(url, files=files, params=params)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Tipo de respuesta: {type(data)}")
            if isinstance(data, list):
                print(f"Cantidad de fechas faltantes: {len(data)}")
                print(f"Fechas: {data}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    print("Probando formatos de archivo para Missing Dates")
    print("=" * 50)
    
    test_yaml_format()
    test_json_format()
    
    print("\n" + "=" * 50)
    print("Tests completados")
