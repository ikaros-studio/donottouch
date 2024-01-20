uniform sampler2D texture;

in vec2 fragTexCoord;
out vec4 fragColor;

void main()
{
    vec4 texColor = texture2D(texture, fragTexCoord);
    fragColor = texColor;
}
