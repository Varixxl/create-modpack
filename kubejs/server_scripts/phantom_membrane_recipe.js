// Priority: 100
// Phantom membrane crafting recipe (since phantoms are disabled)

ServerEvents.recipes(event => {
    event.shapeless('minecraft:phantom_membrane', [
        'minecraft:feather',
        'minecraft:leather',
        'minecraft:slime_ball'
    ]).id('kubejs:phantom_membrane_from_leather')

    event.shapeless('minecraft:phantom_membrane', [
        'minecraft:feather',
        'minecraft:bone',
        'minecraft:slime_ball'
    ]).id('kubejs:phantom_membrane_from_bone')
})
