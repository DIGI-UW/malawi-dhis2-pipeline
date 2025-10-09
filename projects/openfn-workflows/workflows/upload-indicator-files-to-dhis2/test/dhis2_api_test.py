#!/usr/bin/env python3
"""
DHIS2 API Debug Test Script
Tests the exact API sequence that Job 3 executes to isolate failures
"""

import os
import sys
import json
import time
import requests
from pathlib import Path

# Configuration
DHIS2_URL = os.getenv('DHIS2_URL', 'http://localhost:8080')
DHIS2_USER = os.getenv('DHIS2_USER', 'admin')
DHIS2_PASS = os.getenv('DHIS2_PASS', 'district')
OUTPUT_DIR = Path('./test/dhis2-api-results')

# Setup
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
session = requests.Session()
session.auth = (DHIS2_USER, DHIS2_PASS)
session.headers.update({'Content-Type': 'application/json'})


def save_response(name, response):
    """Save response to file for inspection"""
    filepath = OUTPUT_DIR / f"{name}.json"
    try:
        data = response.json()
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return data
    except:
        with open(filepath, 'w') as f:
            f.write(response.text)
        return None


def test_connectivity():
    """Test 0: Basic connectivity"""
    print("\n" + "="*50)
    print("TEST 0: Basic Connectivity")
    print("="*50)
    
    r = session.get(f"{DHIS2_URL}/api/me?fields=id,username")
    data = save_response('00-whoami', r)
    
    if r.status_code == 200 and data:
        print(f"✓ Connected as: {data.get('username')} ({data.get('id')})")
        return True
    else:
        print(f"✗ Connection failed: {r.status_code}")
        print(r.text)
        return False


def create_category_options():
    """Test 1: Create category options"""
    print("\n" + "="*50)
    print("TEST 1: Create Category Options")
    print("="*50)
    
    options = [
        {'name': 'Male', 'shortName': 'Male', 'code': 'MALE'},
        {'name': 'Female', 'shortName': 'Female', 'code': 'FEMALE'}
    ]
    
    ids = {}
    for opt in options:
        # Try to get existing
        r = session.get(f"{DHIS2_URL}/api/categoryOptions", params={
            'filter': f"code:eq:{opt['code']}",
            'fields': 'id',
            'paging': 'false'
        })
        data = save_response(f"01-check-{opt['code'].lower()}", r)
        
        if data and data.get('categoryOptions'):
            ids[opt['code']] = data['categoryOptions'][0]['id']
            print(f"  ✓ Found existing {opt['name']}: {ids[opt['code']]}")
        else:
            # Create new
            r = session.post(f"{DHIS2_URL}/api/categoryOptions", json=opt)
            data = save_response(f"01-create-{opt['code'].lower()}", r)
            
            if r.status_code in [200, 201]:
                uid = data.get('response', {}).get('uid') if data else None
                if uid:
                    ids[opt['code']] = uid
                    print(f"  ✓ Created {opt['name']}: {uid}")
                else:
                    # Retry get
                    time.sleep(1)
                    r2 = session.get(f"{DHIS2_URL}/api/categoryOptions", params={
                        'filter': f"code:eq:{opt['code']}",
                        'fields': 'id',
                        'paging': 'false'
                    })
                    data2 = r2.json()
                    if data2.get('categoryOptions'):
                        ids[opt['code']] = data2['categoryOptions'][0]['id']
                        print(f"  ✓ Resolved {opt['name']}: {ids[opt['code']]}")
            else:
                print(f"  ✗ Failed to create {opt['name']}: {r.status_code}")
                print(r.text)
    
    return ids


def create_sex_category(option_ids):
    """Test 2: Create SEX category"""
    print("\n" + "="*50)
    print("TEST 2: Create SEX Category")
    print("="*50)
    
    # Check existing
    r = session.get(f"{DHIS2_URL}/api/categories", params={
        'filter': 'code:eq:SEX',
        'fields': 'id,name,code,categoryOptions[id,name,code]',
        'paging': 'false'
    })
    data = save_response('02-check-sex-category', r)
    
    if data and data.get('categories'):
        cat_id = data['categories'][0]['id']
        print(f"  ✓ Found existing SEX category: {cat_id}")
        return cat_id, data['categories'][0]
    
    # Create new
    payload = {
        'name': 'Sex',
        'shortName': 'Sex',
        'code': 'SEX',
        'dataDimensionType': 'DISAGGREGATION',
        'categoryOptions': [
            {'id': option_ids['MALE']},
            {'id': option_ids['FEMALE']}
        ]
    }
    
    print(f"  Creating category with options: {list(option_ids.values())}")
    r = session.post(f"{DHIS2_URL}/api/categories", json=payload)
    data = save_response('02-create-sex-category', r)
    
    if r.status_code in [200, 201]:
        uid = data.get('response', {}).get('uid') if data else None
        print(f"  ✓ Created SEX category: {uid}")
        
        # CRITICAL TEST: Can we retrieve immediately?
        print("  ⏱ Testing immediate retrieval...")
        time.sleep(2)
        
        r2 = session.get(f"{DHIS2_URL}/api/categories", params={
            'filter': 'code:eq:SEX',
            'fields': 'id,name,code,categoryOptions[id,name,code]',
            'paging': 'false'
        })
        data2 = save_response('02-verify-sex-category', r2)
        
        if data2 and data2.get('categories'):
            print("  ✓ IMMEDIATE RETRIEVAL SUCCESSFUL")
            return data2['categories'][0]['id'], data2['categories'][0]
        else:
            print("  ✗ IMMEDIATE RETRIEVAL FAILED - This is the bug!")
            return uid, None
    else:
        print(f"  ✗ Failed to create: {r.status_code}")
        print(r.text)
        return None, None


def create_category_combo(category_id):
    """Test 3: Create category combination"""
    print("\n" + "="*50)
    print("TEST 3: Create Category Combination")
    print("="*50)
    
    # Check existing
    r = session.get(f"{DHIS2_URL}/api/categoryCombos", params={
        'filter': 'code:eq:HEALTH_REPORTING_COMBO',
        'fields': 'id,name,code,categories[id,name],categoryOptionCombos[id,name,categoryOptions[id,name,code]]',
        'paging': 'false'
    })
    data = save_response('03-check-combo', r)
    
    if data and data.get('categoryCombos'):
        combo = data['categoryCombos'][0]
        print(f"  ✓ Found existing combo: {combo['id']}")
        print(f"  ✓ Option combos: {len(combo.get('categoryOptionCombos', []))}")
        return combo['id'], combo
    
    # Create new
    payload = {
        'name': 'Health Reporting Combo',
        'code': 'HEALTH_REPORTING_COMBO',
        'dataDimensionType': 'DISAGGREGATION',
        'categories': [{'id': category_id}]
    }
    
    print(f"  Creating combo with category: {category_id}")
    r = session.post(f"{DHIS2_URL}/api/categoryCombos", json=payload)
    data = save_response('03-create-combo', r)
    
    if r.status_code in [200, 201]:
        uid = data.get('response', {}).get('uid') if data else None
        print(f"  ✓ Created combo: {uid}")
        
        # CRITICAL: Wait for DHIS2 to generate option combos
        print("  ⏱ Waiting for option combo generation...")
        time.sleep(3)
        
        r2 = session.get(f"{DHIS2_URL}/api/categoryCombos", params={
            'filter': 'code:eq:HEALTH_REPORTING_COMBO',
            'fields': 'id,name,code,categories[id,name],categoryOptionCombos[id,name,categoryOptions[id,name,code]]',
            'paging': 'false'
        })
        data2 = save_response('03-verify-combo', r2)
        
        if data2 and data2.get('categoryCombos'):
            combo = data2['categoryCombos'][0]
            option_combos = combo.get('categoryOptionCombos', [])
            print(f"  ✓ Combo retrieved with {len(option_combos)} option combos")
            return combo['id'], combo
        else:
            print("  ✗ Failed to retrieve combo with option combos")
            return uid, None
    else:
        print(f"  ✗ Failed to create: {r.status_code}")
        print(r.text)
        return None, None


def create_data_element_with_combo(combo_id):
    """Test 4: Create data element WITH category combo (CRITICAL)"""
    print("\n" + "="*50)
    print("TEST 4: Create Data Element WITH Category Combo")
    print("="*50)
    
    code = 'TX_CURR_TEST_WITH_COMBO'
    
    # Check existing
    r = session.get(f"{DHIS2_URL}/api/dataElements", params={
        'filter': f'code:eq:{code}',
        'fields': 'id,name,code,categoryCombo[id,name,categoryOptionCombos[id,name]]',
        'paging': 'false'
    })
    data = save_response('04-check-de-with-combo', r)
    
    if data and data.get('dataElements'):
        de = data['dataElements'][0]
        print(f"  ✓ Found existing: {de['id']}")
        print(f"  Category combo: {de.get('categoryCombo', {}).get('name')}")
        return de['id']
    
    # Create WITH category combo
    payload = {
        'name': 'TX_CURR Test (With Combo)',
        'shortName': 'TX_CURR Test',
        'code': code,
        'valueType': 'INTEGER',
        'aggregationType': 'SUM',
        'domainType': 'AGGREGATE',
        'categoryCombo': {'id': combo_id}  # CRITICAL LINE
    }
    
    print(f"  Creating data element WITH combo: {combo_id}")
    r = session.post(f"{DHIS2_URL}/api/dataElements", json=payload)
    data = save_response('04-create-de-with-combo', r)
    
    if r.status_code in [200, 201]:
        uid = data.get('response', {}).get('uid') if data else None
        print(f"  ✓ Created: {uid}")
        
        # Verify it has the custom combo
        time.sleep(1)
        r2 = session.get(f"{DHIS2_URL}/api/dataElements", params={
            'filter': f'code:eq:{code}',
            'fields': 'id,name,code,categoryCombo[id,name,categoryOptionCombos[id,name,categoryOptions[id,name,code]]]',
            'paging': 'false'
        })
        data2 = save_response('04-verify-de-with-combo', r2)
        
        if data2 and data2.get('dataElements'):
            de = data2['dataElements'][0]
            combo = de.get('categoryCombo', {})
            print(f"  ✓ Verified combo: {combo.get('name')} ({combo.get('id')})")
            print(f"  ✓ Option combos: {len(combo.get('categoryOptionCombos', []))}")
            return uid
        else:
            print("  ✗ Failed to verify")
            return uid
    else:
        print(f"  ✗ Failed to create: {r.status_code}")
        print(r.text)
        return None


def create_data_element_without_combo():
    """Test 5: Create data element WITHOUT category combo (comparison)"""
    print("\n" + "="*50)
    print("TEST 5: Create Data Element WITHOUT Category Combo (Default)")
    print("="*50)
    
    code = 'TX_CURR_TEST_DEFAULT'
    
    # Check existing
    r = session.get(f"{DHIS2_URL}/api/dataElements", params={
        'filter': f'code:eq:{code}',
        'fields': 'id,name,code,categoryCombo[id,name,categoryOptionCombos[id,name]]',
        'paging': 'false'
    })
    data = save_response('05-check-de-default', r)
    
    if data and data.get('dataElements'):
        de = data['dataElements'][0]
        print(f"  ✓ Found existing: {de['id']}")
        print(f"  Category combo: {de.get('categoryCombo', {}).get('name')}")
        return de['id']
    
    # Create WITHOUT category combo
    payload = {
        'name': 'TX_CURR Test (Default)',
        'shortName': 'TX_CURR Def',
        'code': code,
        'valueType': 'INTEGER',
        'aggregationType': 'SUM',
        'domainType': 'AGGREGATE'
        # NO categoryCombo field
    }
    
    print("  Creating data element WITHOUT combo (will use default)")
    r = session.post(f"{DHIS2_URL}/api/dataElements", json=payload)
    data = save_response('05-create-de-default', r)
    
    if r.status_code in [200, 201]:
        uid = data.get('response', {}).get('uid') if data else None
        print(f"  ✓ Created: {uid}")
        
        # Verify it has default combo
        time.sleep(1)
        r2 = session.get(f"{DHIS2_URL}/api/dataElements", params={
            'filter': f'code:eq:{code}',
            'fields': 'id,name,code,categoryCombo[id,name,categoryOptionCombos[id,name]]',
            'paging': 'false'
        })
        data2 = save_response('05-verify-de-default', r2)
        
        if data2 and data2.get('dataElements'):
            de = data2['dataElements'][0]
            combo = de.get('categoryCombo', {})
            print(f"  ✓ Uses combo: {combo.get('name')} ({combo.get('id')})")
            print(f"  ✓ This is the default combo")
            return uid
        else:
            return uid
    else:
        print(f"  ✗ Failed to create: {r.status_code}")
        print(r.text)
        return None


def test_paging_parameter():
    """Test 6: Compare paging='false' vs paging=false"""
    print("\n" + "="*50)
    print("TEST 6: Paging Parameter Format")
    print("="*50)
    
    # Test with string 'false'
    r1 = session.get(f"{DHIS2_URL}/api/categories", params={
        'filter': 'code:eq:SEX',
        'fields': 'id,name',
        'paging': 'false'  # String
    })
    save_response('06-paging-string', r1)
    print(f"  With paging='false' (string): {r1.status_code}")
    
    # Test with boolean False
    r2 = session.get(f"{DHIS2_URL}/api/categories", params={
        'filter': 'code:eq:SEX',
        'fields': 'id,name',
        'paging': False  # Boolean
    })
    save_response('06-paging-boolean', r2)
    print(f"  With paging=False (boolean): {r2.status_code}")
    
    # Compare results
    if r1.status_code == 200 and r2.status_code == 200:
        print("  ✓ Both formats work")
    else:
        print("  ⚠ Different behavior detected")


def main():
    print("="*50)
    print("DHIS2 API Workflow Debug Test")
    print("="*50)
    print(f"URL: {DHIS2_URL}")
    print(f"User: {DHIS2_USER}")
    print(f"Output: {OUTPUT_DIR}")
    
    # Run tests
    if not test_connectivity():
        print("\n✗ Cannot connect to DHIS2. Exiting.")
        sys.exit(1)
    
    option_ids = create_category_options()
    if not option_ids or len(option_ids) < 2:
        print("\n✗ Failed to create category options. Exiting.")
        sys.exit(1)
    
    cat_id, cat_data = create_sex_category(option_ids)
    if not cat_id:
        print("\n✗ Failed to create SEX category. Exiting.")
        sys.exit(1)
    
    combo_id, combo_data = create_category_combo(cat_id)
    if not combo_id:
        print("\n✗ Failed to create category combo. Exiting.")
        sys.exit(1)
    
    de_with_combo = create_data_element_with_combo(combo_id)
    de_default = create_data_element_without_combo()
    
    test_paging_parameter()
    
    # Summary
    print("\n" + "="*50)
    print("TEST SUMMARY")
    print("="*50)
    print(f"SEX Category ID: {cat_id}")
    print(f"Category Combo ID: {combo_id}")
    print(f"Data Element (with combo): {de_with_combo}")
    print(f"Data Element (default): {de_default}")
    print(f"\nResults saved to: {OUTPUT_DIR}")
    print("\nCRITICAL FINDINGS:")
    print("1. Check if immediate category retrieval works (02-verify-sex-category.json)")
    print("2. Check if combo has option combos (03-verify-combo.json)")
    print("3. Compare data elements: 04-verify-de-with-combo.json vs 05-verify-de-default.json")
    print("4. The data element WITH combo should have 2+ option combos")
    print("5. The data element DEFAULT should have 1 option combo (HllvX50cXC0)")


if __name__ == '__main__':
    main()




