#!/usr/bin/env python3
"""
Test script para probar el endpoint de missing dates
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_missing_dates_range():
    """Prueba con rango de fechas"""
    print("\n=== Test 1: Missing dates con rango de fechas ===")
    url = f"{BASE_URL}/queries/gaps"
    params = {
        "publication": "db",
        "start_date": "1850-01-01",
        "end_date": "1850-01-31"
    }
    
    try:
        response = requests.get(url, params=params)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Tipo de respuesta: {type(data)}")
            if isinstance(data, list):
                print(f"Cantidad de fechas faltantes: {len(data)}")
                if len(data) > 0:
                    print(f"Primeras 3 fechas: {data[:3]}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

def test_missing_dates_file():
    """Prueba con archivo YAML"""
    print("\n=== Test 2: Missing dates con archivo ===")
    url = f"{BASE_URL}/queries/gaps/file"
    
    # Crear contenido de archivo de prueba
    file_content = """1850-01-01
1850-01-02
1850-01-03
1850-01-04
1850-01-05"""
    
    files = {
        'file': ('dates.txt', file_content, 'text/plain')
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
                if len(data) > 0:
                    print(f"Primeras 3 fechas: {data[:3]}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

def test_missing_dates_no_filters():
    """Prueba sin filtros"""
    print("\n=== Test 3: Missing dates sin filtros ===")
    url = f"{BASE_URL}/queries/gaps"
    params = {
        "publication": "db"
    }
    
    try:
        response = requests.get(url, params=params)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Tipo de respuesta: {type(data)}")
            if isinstance(data, list):
                print(f"Cantidad de fechas faltantes: {len(data)}")
                if len(data) > 0:
                    print(f"Primeras 3 fechas: {data[:3]}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    print("Probando endpoints de Missing Dates")
    print("=" * 50)
    
    test_missing_dates_range()
    test_missing_dates_file()
    test_missing_dates_no_filters()
    
    print("\n" + "=" * 50)
    print("Tests completados")
