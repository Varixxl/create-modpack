// priority: 1000
// Fix missing Venus Sandstone tags referenced by Ad Astra's Mekanism recipes

ServerEvents.tags('item', event => {
    event.add('forge:sandstone/venus_sandstone', [
        'ad_astra:venus_sandstone',
        'ad_astra:venus_sandstone_bricks',
        'ad_astra:cracked_venus_sandstone_bricks'
    ])
    event.add('ad_astra:venus_sandstone', [
        'ad_astra:venus_sandstone',
        'ad_astra:venus_sandstone_bricks',
        'ad_astra:cracked_venus_sandstone_bricks'
    ])
    event.add('forge:sandstone', '#forge:sandstone/venus_sandstone')
})

ServerEvents.tags('block', event => {
    event.add('forge:sandstone/venus_sandstone', [
        'ad_astra:venus_sandstone',
        'ad_astra:venus_sandstone_bricks',
        'ad_astra:cracked_venus_sandstone_bricks'
    ])
    event.add('ad_astra:venus_sandstone', [
        'ad_astra:venus_sandstone',
        'ad_astra:venus_sandstone_bricks',
        'ad_astra:cracked_venus_sandstone_bricks'
    ])
    event.add('forge:sandstone', '#forge:sandstone/venus_sandstone')
})
