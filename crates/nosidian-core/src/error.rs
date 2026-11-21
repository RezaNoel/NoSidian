use std::path::PathBuf;

/// Errors produced by the core crate.
///
/// Each variant maps to a stable `code()` that the UI translates, so no
/// English error text ever reaches the interface.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("i/o error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid json in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("vault name is empty or invalid")]
    InvalidVaultName,
    #[error("folder already exists: {0}")]
    AlreadyExists(PathBuf),
    #[error("folder not found: {0}")]
    NotFound(PathBuf),
    #[error("path is not a folder: {0}")]
    NotADirectory(PathBuf),
}

impl CoreError {
    /// Stable, language-neutral identifier used as a translation key suffix
    /// (`error-<code>`).
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::Io { .. } => "io",
            CoreError::Json { .. } => "corrupt-data",
            CoreError::InvalidVaultName => "invalid-vault-name",
            CoreError::AlreadyExists(_) => "already-exists",
            CoreError::NotFound(_) => "not-found",
            CoreError::NotADirectory(_) => "not-a-folder",
        }
    }

    pub(crate) fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        CoreError::Io {
            path: path.into(),
            source,
        }
    }
}

pub type CoreResult<T> = Result<T, CoreError>;
