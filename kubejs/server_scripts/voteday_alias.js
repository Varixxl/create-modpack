// Priority: 10
// Convenient /voteday shorthand alias that triggers /vote day

ServerEvents.commandRegistry(event => {
    const { commands: Commands } = event
    event.register(
        Commands.literal('voteday')
            .executes(ctx => {
                ctx.source.server.commands.performPrefixedCommand(ctx.source, 'vote day')
                return 1
            })
    )
})
