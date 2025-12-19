# -*- coding: utf-8 -*-
"""
Class Name Mapper
Map user-friendly class names to airline-specific class names
"""

# Mapping từ user input (generic) sang airline-specific class names
CLASS_MAPPING = {
    'VJ': {  # VietJet Air
        'economy': 'Eco',
        'eco': 'Eco',
        'business': 'Skyboss',
        'premium': 'Deluxe',
        'deluxe': 'Deluxe'
    },
    'VN': {  # Vietnam Airlines
        'economy': 'Economy Lite',
        'eco': 'Economy Lite',
        'economy_lite': 'Economy Lite',
        'economy_classic': 'Economy Classic',
        'economy_flex': 'Economy Flex',
        'economy_super_lite': 'Economy Super Lite',
        'business': 'Business Classic',
        'business_classic': 'Business Classic',
        'business_flex': 'Business Flex',
        'premium': 'Premium Economy Classic',
        'premium_economy': 'Premium Economy Classic',
        'premium_economy_classic': 'Premium Economy Classic',
        'premium_economy_flex': 'Premium Economy Flex'
    },
    'QH': {  # Bamboo Airways
        'economy': 'Eco',
        'eco': 'Eco',
        'business': 'Business'
    },
    'VU': {  # Vietravel Airlines
        'economy': 'Eco',
        'eco': 'Eco',
        'business': 'Business',
        'deluxe': 'Deluxe'
    }
}

def normalize_class_name(airline: str, user_class: str) -> str:
    """
    Map user-friendly class name to airline-specific class name.
    
    Args:
        airline: Airline code (VJ, VN, QH, VU)
        user_class: User input class name (e.g., 'economy', 'Eco', 'business')
    
    Returns:
        Airline-specific class name (e.g., 'Economy Lite' for VN economy)
    """
    if not airline or not user_class:
        return user_class
    
    airline = airline.upper().strip()
    user_class_lower = user_class.lower().strip().replace(' ', '_')
    
    # Get airline-specific mapping
    airline_map = CLASS_MAPPING.get(airline, {})
    
    # Try to map
    mapped_class = airline_map.get(user_class_lower)
    
    if mapped_class:
        return mapped_class
    
    # If not found, return original (might already be airline-specific name)
    return user_class
