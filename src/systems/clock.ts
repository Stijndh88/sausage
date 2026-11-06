/** Source of game time in ms (pauses with the game; see GameScene.gameTime). */
export interface GameClock {
  now(): number;
}
