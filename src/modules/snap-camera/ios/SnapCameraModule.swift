import ExpoModulesCore

public final class SnapCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SnapCamera")

    Function("triggerSnapFeedback") { () -> String in
      return "Snap feedback test triggered on iOS."
    }
  }
}
